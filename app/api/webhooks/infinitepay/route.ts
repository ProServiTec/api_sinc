import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { confirmarPedidoPago } from "@/lib/pedidosLicenca";
import { verificarPagamento, InfinitePayError } from "@/lib/infinitepay";

/**
 * Webhook de pagamento da InfinitePay. A documentação pública da InfinitePay
 * NÃO especifica nenhuma assinatura/segredo pra validar que a chamada veio
 * mesmo da InfinitePay — por isso, antes de confirmar o pedido, este endpoint
 * reconfirma a transação direto com a InfinitePay via payment_check (server a
 * server) e ainda compara o valor pago com o valor esperado do pedido, como
 * camada extra de proteção contra uma chamada forjada nesta URL.
 *
 * Sempre responde 200 mesmo em erro de negócio (pedido não encontrado, etc.)
 * pra evitar retries infinitos da InfinitePay por algo que não vai se
 * resolver tentando de novo; só responde diferente de 200 em erro transitório
 * (ex.: falha ao falar com a InfinitePay ou com o banco), que é quando faz
 * sentido a InfinitePay tentar reenviar.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400 });
  }

  const orderNsu = body.order_nsu as string | undefined;
  const transactionNsu = body.transaction_nsu as string | undefined;
  const invoiceSlugWebhook = body.invoice_slug as string | undefined;
  const paidAmount = body.paid_amount as number | undefined;

  if (!orderNsu || !transactionNsu) {
    return new Response(JSON.stringify({ error: "order_nsu e transaction_nsu são obrigatórios" }), {
      status: 200,
    });
  }

  try {
    const { rows: pedidoRows } = await pool.query(
      `SELECT id, valor, invoice_slug, status FROM core.pedidos_licenca WHERE id = $1`,
      [orderNsu]
    );
    if (pedidoRows.length === 0) {
      return new Response(JSON.stringify({ error: "Pedido não encontrado" }), { status: 200 });
    }
    const pedido = pedidoRows[0];

    if (pedido.status === "pago") {
      return new Response(JSON.stringify({ ok: true, ja_confirmado: true }), { status: 200 });
    }

    const { rows: configRows } = await pool.query(
      `SELECT mc.infinitepay_handle
       FROM core.master_config mc
       JOIN core.empresas e ON e.id = mc.empresa_id
       WHERE e.is_master = true
       LIMIT 1`
    );
    const handle = configRows[0]?.infinitepay_handle as string | undefined;
    const slug = invoiceSlugWebhook ?? pedido.invoice_slug;

    if (!handle || !slug) {
      return new Response(JSON.stringify({ error: "Handle ou slug ausente, não foi possível reconfirmar" }), {
        status: 200,
      });
    }

    const verificacao = await verificarPagamento({ handle, orderNsu, transactionNsu, slug });

    const valorEsperadoCentavos = Math.round(Number(pedido.valor) * 100);
    const pagamentoConfere =
      verificacao.success &&
      verificacao.paid &&
      (paidAmount === undefined || paidAmount >= valorEsperadoCentavos) &&
      verificacao.paid_amount >= valorEsperadoCentavos;

    if (!pagamentoConfere) {
      return new Response(
        JSON.stringify({ error: "Pagamento não confirmado na reverificação com a InfinitePay" }),
        { status: 200 }
      );
    }

    const resultado = await confirmarPedidoPago(orderNsu, { confirmadoPor: "webhook", transactionNsu });
    return new Response(JSON.stringify({ ok: resultado.ok }), { status: 200 });
  } catch (error) {
    if (error instanceof InfinitePayError) {
      // Falha ao falar com a InfinitePay: transitório, vale a pena a InfinitePay reenviar.
      return new Response(JSON.stringify({ error: error.message }), { status: 502 });
    }
    return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500 });
  }
}
