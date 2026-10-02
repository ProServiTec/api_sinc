import { pool } from "@/lib/db";
import { parseItemsFromBlob, tipoNotaPorModelo } from "./xmlParser";

/**
 * Ingestão fiscal: lê as notas do schema pdv (que já recebem os XMLs via sync),
 * parseia os itens (det/prod) e materializa em core.fiscal_nota /
 * core.fiscal_nota_item. Idempotente por (empresa_id, direcao, chave_acesso).
 *
 * É o preenchimento da migração 2026-09-29-fiscal-notas-estruturadas.sql.
 */

export type Direcao = "entrada" | "saida";

export interface IngestResultado {
  direcao: Direcao;
  notasLidas: number;
  notasProcessadas: number;
  notasIgnoradas: number; // sem chave_acesso ou sem XML aproveitável
  itensExtraidos: number;
}

interface FonteConfig {
  tabela: string;
  xmlColuna: string;
  temModelo: boolean;
  situacaoFiltro: number | null; // entrada realizada = 3 (legado); saída = sem filtro
}

const FONTES: Record<Direcao, FonteConfig> = {
  saida: {
    tabela: "pdv.nota_fiscal",
    xmlColuna: "xml_enviado_autorizacao",
    temModelo: true,
    situacaoFiltro: null,
  },
  entrada: {
    tabela: "pdv.nota_fiscal_compra",
    xmlColuna: "xml_compactado",
    temModelo: false,
    situacaoFiltro: 3,
  },
};

/** Primeiro dia do mês (UTC) de uma competência 'YYYY-MM'. */
export function inicioCompetencia(competencia: string): Date {
  const [ano, mes] = competencia.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, 1));
}

/** Competência do mês anterior ao de referência (default: hoje), como 'YYYY-MM'. */
export function competenciaMesAnterior(ref: Date = new Date()): string {
  const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

interface NotaPdvRow {
  empresa_id: string | null;
  filial_id: string | null;
  source_database: string | null;
  chave_acesso: string | null;
  numero: string | number | null;
  serie: string | number | null;
  modelo: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  situacao: string | number | null;
  row_id: string | number | null;
  xml: Buffer | null;
}

/**
 * Ingere uma direção (entrada|saida) de uma empresa numa competência (mês).
 * `competencia` = 'YYYY-MM'. Idempotente.
 */
export async function ingestNotas(
  empresaId: string,
  competencia: string,
  direcao: Direcao
): Promise<IngestResultado> {
  const fonte = FONTES[direcao];
  const inicio = inicioCompetencia(competencia);
  const fim = new Date(Date.UTC(inicio.getUTCFullYear(), inicio.getUTCMonth() + 1, 1));
  // data_hora_emissao é texto ISO ("2026-09-15T14:02:52.000"): filtro lexicográfico
  // pelo prefixo de data funciona e evita cast frágil de linhas ruins.
  const inicioStr = inicio.toISOString().slice(0, 10);
  const fimStr = fim.toISOString().slice(0, 10);

  const modeloSel = fonte.temModelo ? "modelo" : "NULL::text AS modelo";
  const situacaoCond = fonte.situacaoFiltro != null ? "AND situacao = $4" : "";
  const params: unknown[] = [empresaId, inicioStr, fimStr];
  if (fonte.situacaoFiltro != null) params.push(fonte.situacaoFiltro);

  const sql = `
    SELECT
      _zaya_empresa_id AS empresa_id,
      _zaya_filial_id AS filial_id,
      _zaya_source_database AS source_database,
      chave_acesso,
      numero,
      serie,
      ${modeloSel},
      data_hora_emissao AS data_emissao,
      valor_total,
      situacao,
      _zaya_row_id AS row_id,
      ${fonte.xmlColuna} AS xml
    FROM ${fonte.tabela}
    WHERE _zaya_empresa_id = $1
      AND ${fonte.xmlColuna} IS NOT NULL
      AND data_hora_emissao >= $2
      AND data_hora_emissao < $3
      ${situacaoCond}
      AND data_hora_deletado IS NULL
    ORDER BY numero
  `;

  const resultado: IngestResultado = {
    direcao,
    notasLidas: 0,
    notasProcessadas: 0,
    notasIgnoradas: 0,
    itensExtraidos: 0,
  };

  const client = await pool.connect();
  try {
    const { rows } = await client.query<NotaPdvRow>(sql, params);
    resultado.notasLidas = rows.length;

    for (const row of rows) {
      if (!row.empresa_id || !row.chave_acesso) {
        resultado.notasIgnoradas++;
        continue;
      }
      const itens = parseItemsFromBlob(row.xml);
      const tipo = fonte.temModelo ? tipoNotaPorModelo(row.modelo) : null;
      const competenciaData = `${competencia}-01`;

      await client.query("BEGIN");
      try {
        const { rows: notaRows } = await client.query<{ id: string }>(
          `INSERT INTO core.fiscal_nota
             (empresa_id, filial_id, source_database, direcao, chave_acesso, numero,
              serie, modelo, tipo, data_emissao, competencia, valor_total, situacao,
              origem_tabela, origem_row_id, itens_qtd, xml_disponivel, parseado_em, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
              NULLIF($10,'')::timestamptz, $11::date, $12, $13, $14, $15, $16, true, now(), now())
           ON CONFLICT (empresa_id, direcao, chave_acesso) WHERE chave_acesso IS NOT NULL
           DO UPDATE SET
              filial_id = EXCLUDED.filial_id,
              source_database = EXCLUDED.source_database,
              numero = EXCLUDED.numero,
              serie = EXCLUDED.serie,
              modelo = EXCLUDED.modelo,
              tipo = EXCLUDED.tipo,
              data_emissao = EXCLUDED.data_emissao,
              competencia = EXCLUDED.competencia,
              valor_total = EXCLUDED.valor_total,
              situacao = EXCLUDED.situacao,
              origem_tabela = EXCLUDED.origem_tabela,
              origem_row_id = EXCLUDED.origem_row_id,
              itens_qtd = EXCLUDED.itens_qtd,
              xml_disponivel = true,
              parseado_em = now(),
              updated_at = now()
           RETURNING id`,
          [
            row.empresa_id,
            row.filial_id,
            row.source_database,
            direcao,
            row.chave_acesso,
            row.numero,
            row.serie,
            fonte.temModelo ? row.modelo : null,
            tipo,
            row.data_emissao,
            competenciaData,
            row.valor_total,
            row.situacao,
            fonte.tabela,
            row.row_id,
            itens.length,
          ]
        );
        const notaId = notaRows[0].id;

        // Reescreve os itens (idempotência do reprocessamento).
        await client.query(`DELETE FROM core.fiscal_nota_item WHERE fiscal_nota_id = $1`, [notaId]);
        for (const it of itens) {
          await client.query(
            `INSERT INTO core.fiscal_nota_item
               (fiscal_nota_id, n_item, c_prod, x_prod, ncm, cfop, q_com, v_un_com, v_prod)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              notaId,
              toIntOrNull(it.nItem),
              it.cProd || null,
              it.xProd || null,
              it.ncm || null,
              it.cfop || null,
              toNumOrNull(it.qCom),
              toNumOrNull(it.vUnCom),
              toNumOrNull(it.vProd),
            ]
          );
        }

        await client.query("COMMIT");
        resultado.notasProcessadas++;
        resultado.itensExtraidos += itens.length;
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    client.release();
  }

  return resultado;
}

/** Ingere entrada + saída de uma empresa numa competência. */
export async function ingestCompetencia(
  empresaId: string,
  competencia: string
): Promise<IngestResultado[]> {
  const saida = await ingestNotas(empresaId, competencia, "saida");
  const entrada = await ingestNotas(empresaId, competencia, "entrada");
  return [saida, entrada];
}

function toNumOrNull(v: string): number | null {
  if (!v) return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function toIntOrNull(v: string): number | null {
  const n = parseInt(String(v), 10);
  return Number.isFinite(n) ? n : null;
}
