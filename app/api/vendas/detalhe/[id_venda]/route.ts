import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError } from "@/lib/errors";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id_venda: string }> }
) {
  try {
    const { id_venda } = await params;
    const empresaId = request.nextUrl.searchParams.get("empresa_id");
    
    if (!empresaId) return new Response("empresa_id required", { status: 400 });

    const vendaRes = await pool.query(`
      SELECT * FROM pdv.venda 
      WHERE id_venda = $1 AND _zaya_empresa_id = $2
    `, [id_venda, empresaId]);

    if (vendaRes.rows.length === 0) {
      return new Response("Venda não encontrada", { status: 404 });
    }
    const venda = vendaRes.rows[0];

    const itensRes = await pool.query(`
      SELECT * FROM pdv.venda_item
      WHERE id_venda = $1 AND _zaya_empresa_id = $2 AND cancelado = '0'
      ORDER BY _zaya_row_id ASC
    `, [id_venda, empresaId]);

    const fpRes = await pool.query(`
      SELECT * FROM pdv.venda_forma_pagamento
      WHERE id_venda = $1 AND _zaya_empresa_id = $2
    `, [id_venda, empresaId]);

    return new Response(JSON.stringify({
      venda,
      itens: itensRes.rows,
      pagamentos: fpRes.rows
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
