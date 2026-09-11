import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const revendaId = request.nextUrl.searchParams.get("revenda_id");

  try {
    if (!revendaId) {
      throw new SyncValidationError("revenda_id é obrigatório");
    }

    const { rows } = await pool.query(
      `SELECT l.id AS licenca_id, l.nome, l.valor, l.periodicidade, count(*)::int AS disponiveis
       FROM core.licencas_atribuidas la
       JOIN core.licencas l ON l.id = la.licenca_id
       WHERE la.revenda_id = $1 AND la.empresa_id IS NULL AND la.ativo = true
       GROUP BY l.id, l.nome, l.valor, l.periodicidade
       ORDER BY l.nome`,
      [revendaId]
    );

    return new Response(JSON.stringify({ estoque: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
