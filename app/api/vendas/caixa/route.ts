import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

/** Histórico de sessões de caixa (abertura/fechamento), com o total vendido
 * em cada uma (soma das vendas feitas naquele dispositivo dentro da janela
 * de abertura/fechamento) — aba "Caixa". */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const empresaId = params.get("empresa_id");
  const filialId = params.get("filial_id") || null;
  const pagina = Math.max(1, Number(params.get("pagina") ?? "1") || 1);
  const porPagina = Math.min(100, Math.max(1, Number(params.get("por_pagina") ?? "25") || 25));

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const p = [empresaId, filialId];
    const where = `fc._zaya_empresa_id = $1 AND ($2::uuid IS NULL OR fc._zaya_filial_id = $2)`;

    const [totalResult, itensResult] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total FROM pdv.fechamento_caixa fc WHERE ${where}`, p),
      pool.query(
        `SELECT fc.id_fechamento_caixa, fc.data_abertura, fc.data_fechamento, fc.id_dispositivo,
                (SELECT MAX(v.codigo_dispositivo) FROM pdv.venda v
                  WHERE v._zaya_empresa_id = fc._zaya_empresa_id AND v.id_dispositivo = fc.id_dispositivo) AS codigo_dispositivo,
                (SELECT COALESCE(SUM(v.valor_total_liquido), 0) FROM pdv.venda v
                  WHERE v._zaya_empresa_id = fc._zaya_empresa_id
                    AND v.id_dispositivo = fc.id_dispositivo
                    AND v.cancelada_pelo_usuario = '0'
                    AND v.data_hora_criado >= fc.data_abertura
                    AND (fc.data_fechamento IS NULL OR v.data_hora_criado <= fc.data_fechamento)
                ) AS total_vendido,
                (SELECT COALESCE(SUM(s.valor), 0) FROM pdv.sangria s
                  WHERE s._zaya_empresa_id = fc._zaya_empresa_id
                    AND s.data_hora_deletado IS NULL
                    AND s.data_hora_criado >= fc.data_abertura
                    AND (fc.data_fechamento IS NULL OR s.data_hora_criado <= fc.data_fechamento)
                ) AS total_sangrias,
                (SELECT COALESCE(SUM(su.valor), 0) FROM pdv.suprimento su
                  WHERE su._zaya_empresa_id = fc._zaya_empresa_id
                    AND su.data_hora_deletado IS NULL
                    AND su.data_hora_criado >= fc.data_abertura
                    AND (fc.data_fechamento IS NULL OR su.data_hora_criado <= fc.data_fechamento)
                ) AS total_suprimentos
         FROM pdv.fechamento_caixa fc
         WHERE ${where}
         ORDER BY fc.data_abertura DESC
         LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
        p
      ),
    ]);

    return new Response(
      JSON.stringify({
        caixas: itensResult.rows,
        total: totalResult.rows[0].total,
        pagina,
        por_pagina: porPagina,
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
