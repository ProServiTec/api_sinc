import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const empresaId = request.nextUrl.searchParams.get("empresa_id");

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const { rows: empresaRows } = await pool.query(
      `SELECT id FROM core.empresas WHERE id = $1 AND ativo = true`,
      [empresaId]
    );

    if (empresaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [licencasResumo, titulosResumo, licencas] = await Promise.all([
      // "Licenças" = filiais de todas as empresas-cliente (não-admin)
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE f.ativo)::int AS ativas
         FROM core.filiais f
         JOIN core.empresas e ON e.id = f.empresa_id
         WHERE e.is_admin = false`
      ),
      // Faturas/pagamentos reais: contas a pagar/receber da própria empresa administradora
      pool.query(
        `SELECT
           count(*) FILTER (WHERE saldo > 0 AND vencimento < CURRENT_DATE)::int AS vencidos_count,
           COALESCE(SUM(saldo) FILTER (WHERE saldo > 0 AND vencimento < CURRENT_DATE), 0) AS vencidos_valor,
           count(*) FILTER (WHERE saldo > 0 AND vencimento >= CURRENT_DATE)::int AS pendentes_count,
           COALESCE(SUM(saldo) FILTER (WHERE saldo > 0 AND vencimento >= CURRENT_DATE), 0) AS pendentes_valor
         FROM financeiro.titulos
         WHERE empresa_id = $1`,
        [empresaId]
      ),
      pool.query(
        `SELECT f.id, f.nome, f.ativo, f.created_at, e.nome AS cliente_nome
         FROM core.filiais f
         JOIN core.empresas e ON e.id = f.empresa_id
         WHERE e.is_admin = false
         ORDER BY f.created_at DESC`
      ),
    ]);

    return new Response(
      JSON.stringify({
        licencas_resumo: licencasResumo.rows[0],
        titulos: titulosResumo.rows[0],
        licencas: licencas.rows,
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
