import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

/** Lista de produtos com estoque atual (aba "Estoque"). Destaca quem está
 * abaixo do estoque mínimo configurado no PDV+. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const empresaId = params.get("empresa_id");
  const filialId = params.get("filial_id") || null;
  const busca = params.get("busca") || null;
  const somenteBaixoEstoque = params.get("somente_baixo_estoque") === "1";
  const pagina = Math.max(1, Number(params.get("pagina") ?? "1") || 1);
  const porPagina = Math.min(200, Math.max(1, Number(params.get("por_pagina") ?? "50") || 50));

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const condicoes = [
      `p._zaya_empresa_id = $1`,
      `p.data_hora_deletado IS NULL`,
      `($2::uuid IS NULL OR p._zaya_filial_id = $2)`,
      `($3::text IS NULL OR p.descricao ILIKE '%' || $3 || '%')`,
    ];
    if (somenteBaixoEstoque) {
      condicoes.push(`p.qtd_estoque <= p.qtd_estoque_minimo`);
    }
    const where = condicoes.join(" AND ");
    const p = [empresaId, filialId, busca];

    const [totalResult, itensResult] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total FROM pdv.produto p WHERE ${where}`, p),
      pool.query(
        `SELECT p.id_produto, p.descricao, p.preco_custo, p.preco_venda, p.qtd_estoque, p.qtd_estoque_minimo,
                g.descricao AS grupo
         FROM pdv.produto p
         LEFT JOIN pdv.prod_grupo g ON g.id_prod_grupo = p.id_prod_grupo AND g._zaya_empresa_id = p._zaya_empresa_id
         WHERE ${where}
         ORDER BY p.descricao
         LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
        p
      ),
    ]);

    return new Response(
      JSON.stringify({
        produtos: itensResult.rows,
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
