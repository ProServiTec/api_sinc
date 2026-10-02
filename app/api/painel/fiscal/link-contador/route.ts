import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { gerarTokenContador } from "@/lib/fiscal/contadorToken";

/**
 * Gera o link de acesso do contador aos relatórios fiscais de uma empresa.
 * Só o admin/revenda dono da empresa pode gerar (escopo por revenda_id).
 * POST { empresa_id, revenda_id } -> { url }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const c = classifyError(new SyncValidationError("Invalid JSON body"));
    return json(c, c.status);
  }

  const { empresa_id, revenda_id } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof empresa_id !== "string" || empresa_id.trim() === "") {
      throw new SyncValidationError("empresa_id é obrigatório");
    }
    if (typeof revenda_id !== "string" || revenda_id.trim() === "") {
      throw new SyncValidationError("revenda_id é obrigatório");
    }

    // A empresa precisa pertencer à revenda que está pedindo o link.
    const { rows } = await pool.query(
      `SELECT id FROM core.empresas WHERE id = $1 AND revenda_id = $2`,
      [empresa_id, revenda_id]
    );
    if (rows.length === 0) {
      return json({ error: "Empresa não encontrada para esta revenda" }, 404);
    }

    const token = gerarTokenContador(empresa_id);
    return json({ url: `/fiscal/${token}` });
  } catch (error) {
    const classified = classifyError(error);
    return json(classified, classified.status);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
