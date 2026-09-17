import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { decryptToken } from "@/lib/clientsLink";
import { criarLinkPagamento, InfinitePayError } from "@/lib/infinitepay";

/**
 * Compra de licença agora é em duas etapas: este endpoint cria um PEDIDO
 * pendente e devolve o link de pagamento PIX da InfinitePay — a licença só
 * nasce em core.licencas_atribuidas quando o pagamento é confirmado (webhook
 * em /api/webhooks/infinitepay, ou confirmação manual do Master enquanto o
 * domínio de produção/webhook não está configurado).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const classified = classifyError(new SyncValidationError("Invalid JSON body"));
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { revenda_id, licenca_id } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof revenda_id !== "string" || revenda_id.trim() === "") {
      throw new SyncValidationError("revenda_id é obrigatório");
    }
    if (typeof licenca_id !== "string" || licenca_id.trim() === "") {
      throw new SyncValidationError("licenca_id é obrigatório");
    }

    const cpfCnpj = decryptToken(token);
    if (!cpfCnpj) {
      throw new SyncValidationError("Link inválido");
    }

    const { rows: clienteRows } = await pool.query(
      `SELECT id FROM core.empresas WHERE cpf_cnpj = $1 AND is_admin = false AND revenda_id = $2 LIMIT 1`,
      [cpfCnpj, revenda_id]
    );
    if (clienteRows.length === 0) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const clienteId = clienteRows[0].id;

    const { rows: licencaRows } = await pool.query(
      `SELECT id, nome, valor FROM core.licencas WHERE id = $1 AND ativo = true`,
      [licenca_id]
    );
    if (licencaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Plano de licença não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const licenca = licencaRows[0];

    const { rows: configRows } = await pool.query(
      `SELECT mc.infinitepay_handle
       FROM core.master_config mc
       JOIN core.empresas e ON e.id = mc.empresa_id
       WHERE e.is_master = true
       LIMIT 1`
    );
    const handle = configRows[0]?.infinitepay_handle as string | undefined;
    if (!handle) {
      throw new SyncValidationError(
        "Pagamento PIX não configurado: peça pro Master cadastrar a InfiniteTag em Configurações"
      );
    }

    const { rows: pedidoRows } = await pool.query(
      `INSERT INTO core.pedidos_licenca (revenda_id, empresa_id, licenca_id, valor)
       VALUES ($1, $2, $3, $4)
       RETURNING id, valor, status, created_at`,
      [revenda_id, clienteId, licenca.id, licenca.valor]
    );
    const pedido = pedidoRows[0];

    const appUrl = process.env.APP_URL?.replace(/\/$/, "");
    const valorCentavos = Math.round(Number(licenca.valor) * 100);

    try {
      const link = await criarLinkPagamento({
        handle,
        items: [{ quantity: 1, price: valorCentavos, description: licenca.nome }],
        orderNsu: pedido.id,
        redirectUrl: appUrl ? `${appUrl}/painel/clients/${token}?pedido=${pedido.id}` : undefined,
        webhookUrl: appUrl ? `${appUrl}/api/webhooks/infinitepay` : undefined,
      });

      const { rows: atualizado } = await pool.query(
        `UPDATE core.pedidos_licenca
         SET checkout_url = $2, invoice_slug = $3
         WHERE id = $1
         RETURNING id, valor, status, checkout_url, created_at`,
        [pedido.id, link.checkoutUrl, link.slug]
      );

      return new Response(JSON.stringify({ pedido: atualizado[0] }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (linkError) {
      // Não deixa pedido órfão sem link de pagamento — cancela e propaga o erro.
      await pool.query(`UPDATE core.pedidos_licenca SET status = 'cancelado' WHERE id = $1`, [pedido.id]);
      if (linkError instanceof InfinitePayError) {
        throw new SyncValidationError(`Não foi possível gerar o link de pagamento: ${linkError.message}`);
      }
      throw linkError;
    }
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
