import { pool } from "@/lib/db";
import { classifyError } from "@/lib/errors";
import { STATUS_LICENCA_SQL } from "@/lib/licencaStatus";

export async function GET() {
  try {
    const [totais, porEmpresa, titulos, licencasCompradas] = await Promise.all([
      pool.query(
        `SELECT
           count(*) FILTER (WHERE saldo > 0 AND vencimento < CURRENT_DATE)::int AS vencidos_count,
           COALESCE(SUM(saldo) FILTER (WHERE saldo > 0 AND vencimento < CURRENT_DATE), 0) AS vencidos_valor,
           count(*) FILTER (WHERE saldo > 0 AND vencimento >= CURRENT_DATE)::int AS pendentes_count,
           COALESCE(SUM(saldo) FILTER (WHERE saldo > 0 AND vencimento >= CURRENT_DATE), 0) AS pendentes_valor,
           count(*) FILTER (WHERE saldo <= 0)::int AS pagos_count,
           COALESCE(SUM(valor) FILTER (WHERE saldo <= 0), 0) AS pagos_valor
         FROM financeiro.titulos`
      ),
      pool.query(
        `SELECT e.id, e.nome,
                count(*) FILTER (WHERE t.saldo > 0 AND t.vencimento < CURRENT_DATE)::int AS vencidos_count,
                COALESCE(SUM(t.saldo) FILTER (WHERE t.saldo > 0 AND t.vencimento < CURRENT_DATE), 0) AS vencidos_valor,
                count(*) FILTER (WHERE t.saldo > 0 AND t.vencimento >= CURRENT_DATE)::int AS pendentes_count,
                COALESCE(SUM(t.saldo) FILTER (WHERE t.saldo > 0 AND t.vencimento >= CURRENT_DATE), 0) AS pendentes_valor,
                count(*) FILTER (WHERE t.saldo <= 0)::int AS pagos_count,
                COALESCE(SUM(t.valor) FILTER (WHERE t.saldo <= 0), 0) AS pagos_valor
         FROM financeiro.titulos t
         JOIN core.empresas e ON e.id = t.empresa_id
         GROUP BY e.id, e.nome
         HAVING count(*) > 0
         ORDER BY (COALESCE(SUM(t.saldo) FILTER (WHERE t.saldo > 0), 0)) DESC`
      ),
      pool.query(
        `SELECT t.id, e.nome AS empresa_nome, t.descricao, t.valor, t.saldo, t.vencimento,
                CASE
                  WHEN t.saldo <= 0 THEN 'pago'
                  WHEN t.vencimento < CURRENT_DATE THEN 'atrasado'
                  ELSE 'pendente'
                END AS status_pagamento
         FROM financeiro.titulos t
         JOIN core.empresas e ON e.id = t.empresa_id
         ORDER BY t.vencimento ASC NULLS LAST, t.created_at DESC`
      ),
      pool.query(
        `SELECT la.id, la.codigo, la.revenda_id, r.nome AS revenda_nome, l.nome AS licenca_nome, l.valor, l.periodicidade,
                la.empresa_id, e.nome AS empresa_nome, la.ativo, la.created_at,
                (${STATUS_LICENCA_SQL}) AS status
         FROM core.licencas_atribuidas la
         JOIN core.licencas l ON l.id = la.licenca_id
         JOIN core.empresas r ON r.id = la.revenda_id
         LEFT JOIN core.empresas e ON e.id = la.empresa_id
         ORDER BY la.created_at DESC`
      ),
    ]);

    return new Response(
      JSON.stringify({
        totais: totais.rows[0],
        por_empresa: porEmpresa.rows,
        titulos: titulos.rows,
        licencas_compradas: licencasCompradas.rows,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
