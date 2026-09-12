import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { buscarIdentificacaoFilial } from "@/lib/identificacaoFilial";

/** Lista as filiais (licenças) da empresa logada, já com a identificação real
 * do negócio (quando o sincronizador já mandou pdv.dados_empresa) e se algum
 * dia sincronizou — usado para montar as abas do dashboard, o card de
 * identificação dinâmica e o empty state. */
export async function GET(request: NextRequest) {
  const empresaId = request.nextUrl.searchParams.get("empresa_id");

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const { rows: filiais } = await pool.query(
      `SELECT f.id, f.nome, f.ativo,
              (ss.ultima_sincronizacao IS NOT NULL) AS ja_sincronizou,
              ss.ultima_sincronizacao
       FROM core.filiais f
       LEFT JOIN core.sync_status ss ON ss.empresa_id = f.empresa_id AND ss.filial_id = f.id
       WHERE f.empresa_id = $1
       ORDER BY f.nome`,
      [empresaId]
    );

    const filiaisComIdentificacao = await Promise.all(
      filiais.map(async (f) => ({
        ...f,
        identificacao: f.ja_sincronizou ? await buscarIdentificacaoFilial(empresaId, f.id) : null,
      }))
    );

    return new Response(JSON.stringify({ filiais: filiaisComIdentificacao }), {
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
