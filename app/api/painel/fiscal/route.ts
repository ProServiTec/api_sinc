import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { competenciaMesAnterior, ingestCompetencia } from "@/lib/fiscal/ingest";
import { competenciasDisponiveis, gerarRelatorioFiscal } from "@/lib/fiscal/relatorio";

const COMPETENCIA_RE = /^\d{4}-\d{2}$/;

/**
 * Relatório fiscal de uma empresa numa competência (mês).
 * GET ?empresa_id=<uuid>&competencia=YYYY-MM  (default: mês anterior)
 *
 * Se a competência ainda não foi ingerida, faz a ingestão na hora (primeira
 * abertura do mês) — a ingestão em si é idempotente. O botão "reprocessar"
 * usa POST /api/painel/fiscal/reprocessar para forçar a reingestão.
 */
export async function GET(request: NextRequest) {
  const empresaId = request.nextUrl.searchParams.get("empresa_id");
  const competenciaParam = request.nextUrl.searchParams.get("competencia");
  const revendaId = request.nextUrl.searchParams.get("revenda_id");

  try {
    if (!empresaId) throw new SyncValidationError("empresa_id é obrigatório");

    const competencia = competenciaParam || competenciaMesAnterior();
    if (!COMPETENCIA_RE.test(competencia)) {
      throw new SyncValidationError("competencia deve estar no formato YYYY-MM");
    }

    // Escopo: quando a revenda é informada (fluxo do painel), a empresa precisa
    // pertencer a ela — impede consultar dados fiscais de empresa de terceiros.
    const { rows: empresaRows } = revendaId
      ? await pool.query(`SELECT id, nome FROM core.empresas WHERE id = $1 AND revenda_id = $2`, [
          empresaId,
          revendaId,
        ])
      : await pool.query(`SELECT id, nome FROM core.empresas WHERE id = $1`, [empresaId]);
    if (empresaRows.length === 0) {
      return json({ error: "Empresa não encontrada" }, 404);
    }

    let relatorio = await gerarRelatorioFiscal(empresaId, competencia);

    // Auto-ingestão na primeira abertura de um mês ainda não processado.
    if (!relatorio.disponivel) {
      await ingestCompetencia(empresaId, competencia);
      relatorio = await gerarRelatorioFiscal(empresaId, competencia);
    }

    const competencias = await competenciasDisponiveis(empresaId);

    return json({
      empresa: { id: empresaRows[0].id, nome: empresaRows[0].nome },
      competenciasDisponiveis: competencias,
      relatorio,
    });
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
