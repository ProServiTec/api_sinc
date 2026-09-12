import type { PoolClient } from "pg";
import { pool } from "./db";
import { SyncBancoDivergenteError, SyncValidationError } from "./errors";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

const COLUNA_CACHE_TTL_MS = 5 * 60 * 1000;
let colunaPdvSourceDatabaseCache: { existe: boolean; expiresAt: number } | null = null;

/** Consulta information_schema (nunca falha, mesmo se a coluna não existir) em vez
 * de tentar usar a coluna direto — evita abortar a transação de upsert por causa
 * de uma migração que ainda não rodou nesta base. */
async function colunaPdvSourceDatabaseExiste(): Promise<boolean> {
  if (colunaPdvSourceDatabaseCache && colunaPdvSourceDatabaseCache.expiresAt > Date.now()) {
    return colunaPdvSourceDatabaseCache.existe;
  }

  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = 'filiais' AND column_name = 'pdv_source_database'`
  );

  const existe = rows.length > 0;
  colunaPdvSourceDatabaseCache = { existe, expiresAt: Date.now() + COLUNA_CACHE_TTL_MS };
  return existe;
}

/** Trava "1 licença = 1 banco de dados": a primeira sincronização de uma filial
 * grava qual id_empresa do PDV+ (base_centralizada, enviado como
 * _zaya_source_database) é dono dela. Sincronizações seguintes com um
 * id_empresa diferente são rejeitadas — mas o MESMO id_empresa pode vir de
 * quantos computadores forem (isso é permitido e esperado). */
async function verificarBancoOrigem(
  client: PoolClient,
  filialId: string,
  registros: Record<string, unknown>[]
): Promise<void> {
  const origem = registros
    .map((r) => r["_zaya_source_database"])
    .find((v): v is string => typeof v === "string" && v.trim() !== "");

  if (!origem) return; // instalação antiga que ainda não manda esse campo

  if (!(await colunaPdvSourceDatabaseExiste())) {
    return; // migração ainda não aplicada nesta base: não trava o sync por causa disso
  }

  const { rows } = await client.query<{ pdv_source_database: string | null }>(
    `SELECT pdv_source_database FROM core.filiais WHERE id = $1 FOR UPDATE`,
    [filialId]
  );

  const atual = rows[0]?.pdv_source_database ?? null;

  if (!atual) {
    await client.query(`UPDATE core.filiais SET pdv_source_database = $1 WHERE id = $2`, [
      origem,
      filialId,
    ]);
    return;
  }

  if (atual !== origem) {
    throw new SyncBancoDivergenteError(
      "Esta licença já está vinculada a outro banco de dados do PDV+. " +
        "Cada licença só pode sincronizar os dados de uma única instalação."
    );
  }
}

const TABLES_CACHE_TTL_MS = 5 * 60 * 1000;
let tablesCache: { names: Set<string>; expiresAt: number } | null = null;

async function getPdvTables(): Promise<Set<string>> {
  if (tablesCache && tablesCache.expiresAt > Date.now()) {
    return tablesCache.names;
  }

  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables WHERE schemaname = 'pdv'`
  );

  const names = new Set(rows.map((r) => r.tablename));
  tablesCache = { names, expiresAt: Date.now() + TABLES_CACHE_TTL_MS };
  return names;
}

export async function isTabela(value: string): Promise<boolean> {
  const tables = await getPdvTables();
  return tables.has(value);
}

const columnsCache = new Map<string, string[]>();

async function getColumns(tabela: string): Promise<string[]> {
  const cached = columnsCache.get(tabela);
  if (cached) return cached;

  const { rows } = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'pdv' AND table_name = $1
     ORDER BY ordinal_position`,
    [tabela]
  );

  if (rows.length === 0) {
    throw new Error(`Tabela pdv.${tabela} não encontrada no banco`);
  }

  const columns = rows.map((r) => r.column_name);
  columnsCache.set(tabela, columns);
  return columns;
}

const MAX_PARAMS_PER_QUERY = 60000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

export interface IdentidadeAutenticada {
  empresaId: string;
  filialId: string | null;
}

export async function upsertRecords(
  tabela: string,
  registros: Record<string, unknown>[],
  identidade: IdentidadeAutenticada | null
): Promise<{ upserted: number }> {
  if (!(await isTabela(tabela))) {
    throw new SyncValidationError(`Tabela desconhecida: ${tabela}`);
  }

  if (registros.length === 0) return { upserted: 0 };

  const idColumn = `id_${tabela}`;
  const allColumns = await getColumns(tabela);

  if (!allColumns.includes(idColumn)) {
    throw new SyncValidationError(
      `Tabela pdv.${tabela} não segue o padrão de sincronização (sem coluna ${idColumn})`
    );
  }

  for (const registro of registros) {
    if (identidade) {
      // Instalação já ativada por código de licença (tem token): o servidor
      // decide de qual empresa/filial é o dado, nunca confia no payload —
      // isso impede que uma instalação marque dados como se fossem de outra.
      registro["_zaya_empresa_id"] = identidade.empresaId;
      registro["_zaya_filial_id"] = identidade.filialId;
    } else {
      // Compat com instalações de antes do sistema de token: sem
      // autenticação, o registro precisa trazer ele mesmo a empresa dona
      // (mesma validação que existia antes de termos login por token).
      if (!registro["_zaya_empresa_id"]) {
        throw new SyncValidationError("_zaya_empresa_id é obrigatório em cada registro");
      }
    }

    if (!registro[idColumn]) {
      throw new SyncValidationError(`${idColumn} é obrigatório em cada registro`);
    }
  }

  // Somente colunas reais da tabela, e que ao menos um registro do lote preencheu
  const acceptedColumns = allColumns.filter((c) => c !== "_zaya_synced_at");
  const columns = acceptedColumns.filter((c) =>
    registros.some((r) => Object.prototype.hasOwnProperty.call(r, c))
  );

  for (const required of ["_zaya_empresa_id", "_zaya_filial_id", idColumn]) {
    if (!columns.includes(required)) columns.push(required);
  }

  const conflictTarget = `_zaya_empresa_id, COALESCE(_zaya_filial_id, '${ZERO_UUID}'::uuid), ${idColumn}`;

  const updateSet = columns
    .filter((c) => !["_zaya_empresa_id", "_zaya_filial_id", idColumn].includes(c))
    .map((c) => `${c} = EXCLUDED.${c}`)
    .concat("_zaya_synced_at = now()")
    .join(", ");

  const rowsPerChunk = Math.max(1, Math.floor(MAX_PARAMS_PER_QUERY / columns.length));
  const batches = chunk(registros, rowsPerChunk);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (identidade?.filialId) {
      await verificarBancoOrigem(client, identidade.filialId, registros);
    }

    for (const batch of batches) {
      const values: unknown[] = [];
      const rowsSql = batch.map((registro) => {
        const placeholders = columns.map((col) => {
          values.push(registro[col] ?? null);
          return `$${values.length}`;
        });
        return `(${placeholders.join(", ")})`;
      });

      const sql = `
        INSERT INTO pdv.${tabela} (${columns.join(", ")})
        VALUES ${rowsSql.join(", ")}
        ON CONFLICT (${conflictTarget})
        DO UPDATE SET ${updateSet}
      `;

      await client.query(sql, values);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  await registrarSyncStatus(registros);

  return { upserted: registros.length };
}

/** Marca "sincronizou agora" para cada par (empresa, filial) presente no
 * lote. Registra mesmo em instalações antigas sem token — usa o que cada
 * registro já trouxer de _zaya_empresa_id/_zaya_filial_id. Falha aqui não
 * derruba o sync (os dados já foram gravados com sucesso antes disso). */
async function registrarSyncStatus(registros: Record<string, unknown>[]): Promise<void> {
  const pares = new Map<string, { empresaId: string; filialId: string | null }>();
  for (const registro of registros) {
    const empresaId = registro["_zaya_empresa_id"] as string | undefined;
    if (!empresaId) continue;
    const filialId = (registro["_zaya_filial_id"] as string | null | undefined) ?? null;
    pares.set(`${empresaId}:${filialId ?? ""}`, { empresaId, filialId });
  }

  if (pares.size === 0) return;

  try {
    for (const { empresaId, filialId } of pares.values()) {
      await pool.query(
        `INSERT INTO core.sync_status (empresa_id, filial_id, ultima_sincronizacao)
         VALUES ($1, $2, now())
         ON CONFLICT (empresa_id, (COALESCE(filial_id, '${ZERO_UUID}'::uuid)))
         DO UPDATE SET ultima_sincronizacao = now()`,
        [empresaId, filialId]
      );
    }
  } catch (error) {
    console.error("[sync] falha ao registrar sync_status:", error);
  }
}

export async function listRecords(
  tabela: string,
  limit: number,
  empresaId: string,
  filialId: string | null
): Promise<unknown[]> {
  if (!(await isTabela(tabela))) {
    throw new SyncValidationError(`Tabela desconhecida: ${tabela}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM pdv.${tabela}
     WHERE _zaya_empresa_id = $1 AND ($2::uuid IS NULL OR _zaya_filial_id = $2)
     ORDER BY _zaya_synced_at DESC
     LIMIT $3`,
    [empresaId, filialId, limit]
  );
  return rows;
}
