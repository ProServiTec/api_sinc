import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { ingestCompetencia } from "@/lib/fiscal/ingest";
import { gerarRelatorioFiscal } from "@/lib/fiscal/relatorio";

const COMPETENCIA_RE = /^\d{4}-\d{2}$/;

/**
 * Força a reingestão de uma competência (botão "reprocessar" do painel) e
 * devolve o relatório atualizado. A ingestão é idempotente.
 * POST { empresa_id, competencia: 'YYYY-MM' }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const c = classifyError(new SyncValidationError("Invalid JSON body"));
    return json(c, c.status);
  }

  const { empresa_id, competencia } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof empresa_id !== "string" || empresa_id.trim() === "") {
      throw new SyncValidationError("empresa_id é obrigatório");
    }
    if (typeof competencia !== "string" || !COMPETENCIA_RE.test(competencia)) {
      throw new SyncValidationError("competencia deve estar no formato YYYY-MM");
    }

    const { rows } = await pool.query(`SELECT id FROM core.empresas WHERE id = $1`, [empresa_id]);
    if (rows.length === 0) return json({ error: "Empresa não encontrada" }, 404);

    const resultados = await ingestCompetencia(empresa_id, competencia);
    const relatorio = await gerarRelatorioFiscal(empresa_id, competencia);

    return json({ ingestao: resultados, relatorio });
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
