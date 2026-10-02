import { pool } from "@/lib/db";
import type { Direcao } from "./ingest";

/**
 * Camada de consulta dos relatórios fiscais: agrega core.fiscal_nota /
 * core.fiscal_nota_item (já materializados pela ingestão) para o painel.
 * Espelha as visões do legado (stats_calculator.py): totais, por tipo
 * (NF-e/NFC-e), entrada × saída, ranking de produtos, por NCM e por CFOP.
 */

export interface ResumoTipo {
  tipo: string;
  notas: number;
  valor: number;
}

export interface ResumoDirecao {
  direcao: Direcao;
  notas: number;
  itens: number;
  valorTotal: number;
  porTipo: ResumoTipo[];
}

export interface ProdutoRank {
  cProd: string;
  xProd: string;
  ncm: string;
  quantidade: number;
  valor: number;
  notas: number;
}

export interface Agrupamento {
  chave: string;
  itens: number;
  quantidade: number;
  valor: number;
}

export interface RelatorioFiscal {
  empresaId: string;
  competencia: string; // 'YYYY-MM'
  disponivel: boolean; // há notas ingeridas nessa competência?
  saida: ResumoDirecao;
  entrada: ResumoDirecao;
  topProdutos: ProdutoRank[]; // por saída (vendas)
  porNcm: Agrupamento[];
  porCfop: Agrupamento[];
  geradoEm: string;
}

function vazio(direcao: Direcao): ResumoDirecao {
  return { direcao, notas: 0, itens: 0, valorTotal: 0, porTipo: [] };
}

export async function gerarRelatorioFiscal(
  empresaId: string,
  competencia: string
): Promise<RelatorioFiscal> {
  const comp = `${competencia}-01`;

  const [resumoRows, tipoRows, produtosRows, ncmRows, cfopRows] = await Promise.all([
    pool.query<{ direcao: Direcao; notas: string; itens: string; valor: string }>(
      `SELECT direcao,
              count(*)::int AS notas,
              COALESCE(sum(itens_qtd),0)::int AS itens,
              COALESCE(sum(valor_total),0) AS valor
       FROM core.fiscal_nota
       WHERE empresa_id = $1 AND competencia = $2::date
       GROUP BY direcao`,
      [empresaId, comp]
    ),
    pool.query<{ direcao: Direcao; tipo: string; notas: string; valor: string }>(
      `SELECT direcao, COALESCE(tipo,'—') AS tipo,
              count(*)::int AS notas,
              COALESCE(sum(valor_total),0) AS valor
       FROM core.fiscal_nota
       WHERE empresa_id = $1 AND competencia = $2::date
       GROUP BY direcao, COALESCE(tipo,'—')
       ORDER BY valor DESC`,
      [empresaId, comp]
    ),
    // Agrupa por descrição + NCM (o PDV reutiliza o mesmo c_prod para produtos
    // distintos, então agrupar por código misturaria itens diferentes).
    pool.query<{ c_prod: string; x_prod: string; ncm: string; q: string; v: string; n: string }>(
      `SELECT max(i.c_prod) AS c_prod,
              COALESCE(NULLIF(i.x_prod,''),'—') AS x_prod,
              COALESCE(NULLIF(i.ncm,''),'') AS ncm,
              COALESCE(sum(i.q_com),0) AS q,
              COALESCE(sum(i.v_prod),0) AS v,
              count(DISTINCT i.fiscal_nota_id)::int AS n
       FROM core.fiscal_nota_item i
       JOIN core.fiscal_nota n ON n.id = i.fiscal_nota_id
       WHERE n.empresa_id = $1 AND n.competencia = $2::date AND n.direcao = 'saida'
       GROUP BY COALESCE(NULLIF(i.x_prod,''),'—'), COALESCE(NULLIF(i.ncm,''),'')
       ORDER BY v DESC
       LIMIT 50`,
      [empresaId, comp]
    ),
    pool.query<{ ncm: string; itens: string; q: string; v: string }>(
      `SELECT COALESCE(NULLIF(i.ncm,''),'—') AS ncm,
              count(*)::int AS itens,
              COALESCE(sum(i.q_com),0) AS q,
              COALESCE(sum(i.v_prod),0) AS v
       FROM core.fiscal_nota_item i
       JOIN core.fiscal_nota n ON n.id = i.fiscal_nota_id
       WHERE n.empresa_id = $1 AND n.competencia = $2::date
       GROUP BY COALESCE(NULLIF(i.ncm,''),'—')
       ORDER BY v DESC
       LIMIT 100`,
      [empresaId, comp]
    ),
    pool.query<{ cfop: string; itens: string; q: string; v: string }>(
      `SELECT COALESCE(NULLIF(i.cfop,''),'—') AS cfop,
              count(*)::int AS itens,
              COALESCE(sum(i.q_com),0) AS q,
              COALESCE(sum(i.v_prod),0) AS v
       FROM core.fiscal_nota_item i
       JOIN core.fiscal_nota n ON n.id = i.fiscal_nota_id
       WHERE n.empresa_id = $1 AND n.competencia = $2::date
       GROUP BY COALESCE(NULLIF(i.cfop,''),'—')
       ORDER BY v DESC
       LIMIT 100`,
      [empresaId, comp]
    ),
  ]);

  const saida = vazio("saida");
  const entrada = vazio("entrada");
  for (const r of resumoRows.rows) {
    const alvo = r.direcao === "entrada" ? entrada : saida;
    alvo.notas = Number(r.notas);
    alvo.itens = Number(r.itens);
    alvo.valorTotal = Number(r.valor);
  }
  for (const t of tipoRows.rows) {
    const alvo = t.direcao === "entrada" ? entrada : saida;
    alvo.porTipo.push({ tipo: t.tipo, notas: Number(t.notas), valor: Number(t.valor) });
  }

  return {
    empresaId,
    competencia,
    disponivel: saida.notas > 0 || entrada.notas > 0,
    saida,
    entrada,
    topProdutos: produtosRows.rows.map((p) => ({
      cProd: p.c_prod ?? "",
      xProd: p.x_prod ?? "",
      ncm: p.ncm ?? "",
      quantidade: Number(p.q),
      valor: Number(p.v),
      notas: Number(p.n),
    })),
    porNcm: ncmRows.rows.map((r) => ({
      chave: r.ncm,
      itens: Number(r.itens),
      quantidade: Number(r.q),
      valor: Number(r.v),
    })),
    porCfop: cfopRows.rows.map((r) => ({
      chave: r.cfop,
      itens: Number(r.itens),
      quantidade: Number(r.q),
      valor: Number(r.v),
    })),
    geradoEm: new Date().toISOString(),
  };
}

/** Competências que já têm notas ingeridas (para o seletor de mês). */
export async function competenciasDisponiveis(empresaId: string): Promise<string[]> {
  const { rows } = await pool.query<{ competencia: string }>(
    `SELECT DISTINCT to_char(competencia,'YYYY-MM') AS competencia
     FROM core.fiscal_nota
     WHERE empresa_id = $1 AND competencia IS NOT NULL
     ORDER BY 1 DESC`,
    [empresaId]
  );
  return rows.map((r) => r.competencia);
}
