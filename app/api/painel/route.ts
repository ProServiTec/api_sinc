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
      `SELECT id, nome FROM core.empresas WHERE id = $1 AND ativo = true`,
      [empresaId]
    );

    if (empresaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const [clientesResumo, licencasResumo, dispositivosResumo, titulosResumo, clientesRecentes] =
      await Promise.all([
        pool.query(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE ativo)::int AS ativos
           FROM core.empresas
           WHERE is_admin = false`
        ),
        // "Licenças" = filiais das empresas-cliente (cada licença é associada a uma filial)
        pool.query(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE f.ativo)::int AS ativas
           FROM core.filiais f
           JOIN core.empresas e ON e.id = f.empresa_id
           WHERE e.is_admin = false`
        ),
        pool.query(
          `SELECT count(*)::int AS total, count(*) FILTER (WHERE d.ativo)::int AS ativos
           FROM core.dispositivos d
           JOIN core.empresas e ON e.id = d.empresa_id
           WHERE e.is_admin = false`
        ),
        // Faturas: contas a pagar/receber da própria empresa administradora (não dos clientes)
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
          `SELECT e.id, e.nome, e.razao_social, e.cpf_cnpj, e.ativo,
                  (SELECT count(*)::int FROM core.filiais f WHERE f.empresa_id = e.id) AS licencas,
                  (SELECT count(*)::int FROM core.dispositivos d WHERE d.empresa_id = e.id) AS dispositivos
           FROM core.empresas e
           WHERE e.is_admin = false
           ORDER BY e.created_at DESC
           LIMIT 5`
        ),
      ]);

    return new Response(
      JSON.stringify({
        empresa: empresaRows[0],
        clientes: clientesResumo.rows[0],
        licencas: licencasResumo.rows[0],
        dispositivos: dispositivosResumo.rows[0],
        titulos: titulosResumo.rows[0],
        clientes_recentes: clientesRecentes.rows,
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
