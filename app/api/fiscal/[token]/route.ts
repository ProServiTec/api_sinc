import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { lerTokenContador } from "@/lib/fiscal/contadorToken";
import { competenciaMesAnterior, ingestCompetencia } from "@/lib/fiscal/ingest";
import { competenciasDisponiveis, gerarRelatorioFiscal } from "@/lib/fiscal/relatorio";

const COMPETENCIA_RE = /^\d{4}-\d{2}$/;

/**
 * Acesso do contador (externo) aos relatórios fiscais de UMA empresa, via
 * token cifrado com escopo fiscal. Somente leitura. O token identifica a
 * empresa; não é preciso login no painel.
 * GET /api/fiscal/:token?competencia=YYYY-MM
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  try {
    const empresaId = lerTokenContador(token);
    if (!empresaId) {
      return json({ error: "Link inválido ou expirado" }, 404);
    }

    const competencia = request.nextUrl.searchParams.get("competencia") || competenciaMesAnterior();
    if (!COMPETENCIA_RE.test(competencia)) {
      throw new SyncValidationError("competencia deve estar no formato YYYY-MM");
    }

    const { rows } = await pool.query(`SELECT id, nome FROM core.empresas WHERE id = $1`, [
      empresaId,
    ]);
    if (rows.length === 0) {
      return json({ error: "Empresa não encontrada" }, 404);
    }

    let relatorio = await gerarRelatorioFiscal(empresaId, competencia);
    if (!relatorio.disponivel) {
      await ingestCompetencia(empresaId, competencia);
      relatorio = await gerarRelatorioFiscal(empresaId, competencia);
    }

    const competencias = await competenciasDisponiveis(empresaId);

    return json({
      empresa: { nome: rows[0].nome },
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
