import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { enviarPacoteContador } from "@/lib/fiscal/envio";

const COMPETENCIA_RE = /^\d{4}-\d{2}$/;

/**
 * Envio manual do pacote fiscal ao contador (botão do painel).
 * POST { empresa_id, revenda_id, competencia: 'YYYY-MM' }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const c = classifyError(new SyncValidationError("Invalid JSON body"));
    return json(c, c.status);
  }
  const { empresa_id, revenda_id, competencia } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof empresa_id !== "string" || typeof revenda_id !== "string") {
      throw new SyncValidationError("empresa_id e revenda_id são obrigatórios");
    }
    if (typeof competencia !== "string" || !COMPETENCIA_RE.test(competencia)) {
      throw new SyncValidationError("competencia deve estar no formato YYYY-MM");
    }
    const { rows } = await pool.query(
      `SELECT 1 FROM core.empresas WHERE id = $1 AND revenda_id = $2`,
      [empresa_id, revenda_id]
    );
    if (rows.length === 0) return json({ error: "Empresa não encontrada" }, 404);

    const resultado = await enviarPacoteContador(empresa_id, competencia);
    return json(resultado);
  } catch (error) {
    const c = classifyError(error);
    return json(c, c.status);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
