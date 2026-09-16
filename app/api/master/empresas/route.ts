import { pool } from "@/lib/db";
import { classifyError } from "@/lib/errors";
import { encryptToToken } from "@/lib/clientsLink";

export async function GET() {
  try {
    const [resumo, clientes] = await Promise.all([
      pool.query(
        `SELECT
           count(*)::int AS total,
           count(*) FILTER (WHERE ativo)::int AS ativos,
           count(*) FILTER (WHERE NOT ativo)::int AS inativos
         FROM core.empresas
         WHERE is_admin = false`
      ),
      pool.query(
        `SELECT e.id, e.nome, e.razao_social, e.cpf_cnpj, e.ativo, e.created_at,
                (SELECT count(*)::int FROM core.filiais f WHERE f.empresa_id = e.id) AS licencas,
                (SELECT count(*)::int FROM core.filiais f WHERE f.empresa_id = e.id AND f.ativo) AS licencas_ativas,
                (SELECT count(*)::int FROM core.dispositivos d WHERE d.empresa_id = e.id) AS dispositivos,
                (CASE
                   WHEN EXISTS (SELECT 1 FROM financeiro.titulos t WHERE t.empresa_id = e.id AND t.saldo > 0 AND t.vencimento < CURRENT_DATE)
                     THEN 'vencida'
                   WHEN EXISTS (SELECT 1 FROM financeiro.titulos t WHERE t.empresa_id = e.id AND t.saldo > 0)
                     THEN 'pendente'
                   WHEN EXISTS (SELECT 1 FROM financeiro.titulos t WHERE t.empresa_id = e.id)
                     THEN 'em_dia'
                   ELSE NULL
                 END) AS fatura_status
         FROM core.empresas e
         WHERE e.is_admin = false
         ORDER BY e.created_at DESC`
      ),
    ]);

    const licencasAtivasTotal = clientes.rows.reduce((soma, c) => soma + c.licencas_ativas, 0);

    // O link de detalhes leva o CPF/CNPJ criptografado, nunca em texto puro na URL.
    const clientesComToken = clientes.rows.map((c) => ({
      ...c,
      token: c.cpf_cnpj ? encryptToToken(c.cpf_cnpj) : null,
    }));

    return new Response(
      JSON.stringify({
        resumo: {
          clientes: resumo.rows[0],
          licencas_ativas: licencasAtivasTotal,
          maquinas: clientes.rows.reduce((soma, c) => soma + c.dispositivos, 0),
        },
        clientes: clientesComToken,
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
