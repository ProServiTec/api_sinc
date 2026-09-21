import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { confirmarPedidoPago } from "@/lib/pedidosLicenca";
import { verificarPagamento, InfinitePayError } from "@/lib/infinitepay";

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
    // Busca todos os pedidos que correspondam ao ID único OU ao lote_id
    const { rows: pedidoRows } = await pool.query(
      `SELECT id, valor, invoice_slug, status FROM core.pedidos_licenca WHERE id = $1 OR lote_id = $1`,
      [orderNsu]
    );

    if (pedidoRows.length === 0) {
      return new Response(JSON.stringify({ error: "Pedido ou Lote não encontrado" }), { status: 200 });
    }

    // Se todos já estiverem pagos, apenas retorna OK (idempotência)
    if (pedidoRows.every((p) => p.status === "pago" || p.status === "confirmado")) {
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
    
    // Todos os pedidos do lote terão o mesmo invoice_slug se gerados pelo novo fluxo
    const slug = invoiceSlugWebhook ?? pedidoRows[0].invoice_slug;

    if (!handle || !slug) {
      return new Response(JSON.stringify({ error: "Handle ou slug ausente, não foi possível reconfirmar" }), {
        status: 200,
      });
    }

    const verificacao = await verificarPagamento({ handle, orderNsu, transactionNsu, slug });

    // Soma o valor esperado de todos os pedidos no lote
    const valorEsperadoTotalCentavos = pedidoRows.reduce((acc, p) => acc + Math.round(Number(p.valor) * 100), 0);

    const pagamentoConfere =
      verificacao.success &&
      verificacao.paid &&
      (paidAmount === undefined || paidAmount >= valorEsperadoTotalCentavos) &&
      verificacao.paid_amount >= valorEsperadoTotalCentavos;

    if (!pagamentoConfere) {
      return new Response(
        JSON.stringify({ error: "Pagamento não confirmado na reverificação com a InfinitePay" }),
        { status: 200 }
      );
    }

    // Confirma todos os pedidos encontrados
    let ok = true;
    for (const pedido of pedidoRows) {
      if (pedido.status !== "pago" && pedido.status !== "confirmado") {
        const resultado = await confirmarPedidoPago(pedido.id, { confirmadoPor: "webhook", transactionNsu });
        if (!resultado.ok) ok = false;
      }
    }

    return new Response(JSON.stringify({ ok }), { status: 200 });
  } catch (error) {
    if (error instanceof InfinitePayError) {
      return new Response(JSON.stringify({ error: error.message }), { status: 502 });
    }
    return new Response(JSON.stringify({ error: "Erro interno" }), { status: 500 });
  }
}
