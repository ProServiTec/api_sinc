import { pool } from "@/lib/db";
import { classifyError } from "@/lib/errors";
import { STATUS_LICENCA_SQL } from "@/lib/licencaStatus";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { rows: revendaRows } = await pool.query(
      `SELECT id, nome, razao_social, cpf_cnpj, ativo, created_at
       FROM core.empresas
       WHERE id = $1 AND is_admin = true AND is_master = false`,
      [id]
    );

    if (revendaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Parceiro não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { rows: licencas } = await pool.query(
      `SELECT la.id, la.codigo, la.licenca_id, l.nome AS licenca_nome, l.valor, l.periodicidade, l.dia_fechamento,
              la.empresa_id, e.nome AS empresa_nome, la.ativo, la.created_at,
              (${STATUS_LICENCA_SQL}) AS status
       FROM core.licencas_atribuidas la
       JOIN core.licencas l ON l.id = la.licenca_id
       LEFT JOIN core.empresas e ON e.id = la.empresa_id
       WHERE la.revenda_id = $1
       ORDER BY la.created_at DESC`,
      [id]
    );

    const resumo = {
      total: licencas.length,
      ativas: licencas.filter((l) => l.status === "ativa").length,
      atrasadas: licencas.filter((l) => l.status === "atrasada").length,
      canceladas: licencas.filter((l) => l.status === "cancelada").length,
      em_estoque: licencas.filter((l) => l.empresa_id === null).length,
      atribuidas: licencas.filter((l) => l.empresa_id !== null).length,
    };

    return new Response(
      JSON.stringify({ revenda: revendaRows[0], resumo, licencas }),
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
