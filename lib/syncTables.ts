import { pool } from "./db";
import { SyncValidationError } from "./errors";

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

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

export async function upsertRecords(
  tabela: string,
  registros: Record<string, unknown>[]
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
    if (!registro["_zaya_empresa_id"]) {
      throw new SyncValidationError("_zaya_empresa_id é obrigatório em cada registro");
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

  return { upserted: registros.length };
}

export async function listRecords(
  tabela: string,
  limit: number
): Promise<unknown[]> {
  if (!(await isTabela(tabela))) {
    throw new SyncValidationError(`Tabela desconhecida: ${tabela}`);
  }

  const { rows } = await pool.query(
    `SELECT * FROM pdv.${tabela} ORDER BY _zaya_synced_at DESC LIMIT $1`,
    [limit]
  );
  return rows;
}
