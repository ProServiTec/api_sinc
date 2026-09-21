const BASE_URL = "https://api.checkout.infinitepay.io";

export class InfinitePayError extends Error {
  raw?: unknown;
  constructor(message: string, raw?: unknown) {
    super(message);
    this.name = "InfinitePayError";
    this.raw = raw;
  }
}

interface ItemPedido {
  quantity: number;
  price: number; // em centavos
  description: string;
}

interface CriarLinkParams {
  handle: string;
  items: ItemPedido[];
  orderNsu: string;
  redirectUrl?: string;
  webhookUrl?: string;
  /** "pix" envia só PIX; "credit_card" envia só cartão; undefined deixa a InfinitePay exibir ambos */
}

interface CriarLinkResultado {
  checkoutUrl: string;
  slug: string | null;
  raw: unknown;
}

/**
 * Cria um link de checkout PIX/cartão na InfinitePay. A documentação pública
 * não especifica o formato exato da resposta de sucesso (só o corpo da
 * requisição e o payload do webhook), então tentamos os nomes de campo mais
 * prováveis pra URL de checkout e guardamos o corpo bruto em `raw` — se a
 * InfinitePay usar um nome diferente, ajuste a lista abaixo.
 */
export async function criarLinkPagamento(params: CriarLinkParams): Promise<CriarLinkResultado> {
  const response = await fetch(`${BASE_URL}/links`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handle: params.handle,
      items: params.items,
      order_nsu: params.orderNsu,
      ...(params.redirectUrl ? { redirect_url: params.redirectUrl } : {}),
      ...(params.webhookUrl ? { webhook_url: params.webhookUrl } : {}),
    }),
  });

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;

  if (!response.ok || !data || data.success === false) {
    const mensagem =
      (data && (data.message as string)) ||
      (data && (data.error as string)) ||
      `InfinitePay retornou status ${response.status}`;
    throw new InfinitePayError(mensagem, data);
  }

  const checkoutUrl =
    (data.url as string | undefined) ??
    (data.checkout_url as string | undefined) ??
    (data.link as string | undefined) ??
    (data.payment_url as string | undefined) ??
    null;

  if (!checkoutUrl) {
    throw new InfinitePayError(
      "InfinitePay não retornou a URL do checkout (formato de resposta inesperado)",
      data
    );
  }

  const slug = (data.slug as string | undefined) ?? (data.invoice_slug as string | undefined) ?? null;

  return { checkoutUrl, slug, raw: data };
}

interface VerificarPagamentoParams {
  handle: string;
  orderNsu: string;
  transactionNsu: string;
  slug: string;
}

interface VerificarPagamentoResultado {
  success: boolean;
  paid: boolean;
  amount: number;
  paid_amount: number;
  installments: number;
  capture_method: string;
}

/** Reconfirma diretamente com a InfinitePay que uma transação foi paga — usado
 * como reforço ao receber o webhook, já que ele não tem assinatura/segredo. */
export async function verificarPagamento(
  params: VerificarPagamentoParams
): Promise<VerificarPagamentoResultado> {
  const response = await fetch(`${BASE_URL}/payment_check`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      handle: params.handle,
      order_nsu: params.orderNsu,
      transaction_nsu: params.transactionNsu,
      slug: params.slug,
    }),
  });

  const data = (await response.json().catch(() => null)) as VerificarPagamentoResultado | null;

  if (!response.ok || !data) {
    throw new InfinitePayError(`InfinitePay retornou status ${response.status}`, data);
  }

  return data;
}
