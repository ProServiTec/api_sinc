import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

/**
 * Consulta o status de um pedido de licença (pendente/pago/cancelado). O
 * painel do revendedor faz polling nesse endpoint enquanto o cliente paga o
 * PIX — o status só muda via webhook da InfinitePay ou confirmação manual do
 * Master (ver /api/webhooks/infinitepay e /api/master/pedidos-licenca).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; pedidoId: string }> }
) {
  const { pedidoId } = await params;
  const revendaId = request.nextUrl.searchParams.get("revenda_id");

  try {
    if (!revendaId) {
      throw new SyncValidationError("revenda_id é obrigatório");
    }

    const { rows } = await pool.query(
      `SELECT id, status, valor, checkout_url, created_at, paid_at
       FROM core.pedidos_licenca
       WHERE id = $1 AND revenda_id = $2`,
      [pedidoId, revendaId]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ pedido: rows[0] }), {
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
