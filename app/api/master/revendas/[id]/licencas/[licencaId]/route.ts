import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; licencaId: string }> }
) {
  const { id, licencaId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const classified = classifyError(new SyncValidationError("Invalid JSON body"));
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { ativo } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof ativo !== "boolean") {
      throw new SyncValidationError("ativo é obrigatório");
    }

    const { rows } = await pool.query(
      `UPDATE core.licencas_atribuidas
       SET ativo = $1, updated_at = now()
       WHERE id = $2 AND revenda_id = $3
       RETURNING id, ativo`,
      [ativo, licencaId, id]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Licença não encontrada para este parceiro" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ licenca: rows[0] }), {
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
