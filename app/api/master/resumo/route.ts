import { pool } from "@/lib/db";
import { classifyError } from "@/lib/errors";

export async function GET() {
  try {
    const [revendas, clientes, licencas, dispositivos, vendas, titulos] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE ativo)::int AS ativas
         FROM core.empresas
         WHERE is_admin = true AND is_master = false`
      ),
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE ativo)::int AS ativos
         FROM core.empresas
         WHERE is_admin = false`
      ),
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE ativo)::int AS ativas
         FROM core.filiais`
      ),
      pool.query(
        `SELECT count(*)::int AS total, count(*) FILTER (WHERE ativo)::int AS ativos
         FROM core.dispositivos`
      ),
      pool.query(
        `SELECT count(*)::int AS total, COALESCE(SUM(valor_total_liquido), 0) AS valor_total
         FROM pdv.venda
         WHERE cancelada_pelo_usuario = '0'`
      ),
      // Finanças da plataforma inteira, somando todas as empresas
      pool.query(
        `SELECT
           count(*) FILTER (WHERE saldo > 0 AND vencimento < CURRENT_DATE)::int AS vencidos_count,
           COALESCE(SUM(saldo) FILTER (WHERE saldo > 0 AND vencimento < CURRENT_DATE), 0) AS vencidos_valor,
           count(*) FILTER (WHERE saldo > 0 AND vencimento >= CURRENT_DATE)::int AS pendentes_count,
           COALESCE(SUM(saldo) FILTER (WHERE saldo > 0 AND vencimento >= CURRENT_DATE), 0) AS pendentes_valor
         FROM financeiro.titulos`
      ),
    ]);

    return new Response(
      JSON.stringify({
        revendas: revendas.rows[0],
        clientes: clientes.rows[0],
        licencas: licencas.rows[0],
        dispositivos: dispositivos.rows[0],
        vendas: vendas.rows[0],
        titulos: titulos.rows[0],
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
