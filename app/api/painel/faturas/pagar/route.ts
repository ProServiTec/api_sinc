import { randomUUID } from "crypto";
import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { criarLinkPagamento, InfinitePayError } from "@/lib/infinitepay";

export async function POST(request: NextRequest) {
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

  const { revenda_id, plano_id, filiais_ids, metodo_pagamento } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof revenda_id !== "string" || revenda_id.trim() === "") {
      throw new SyncValidationError("revenda_id é obrigatório");
    }
    if (typeof plano_id !== "string" || plano_id.trim() === "") {
      throw new SyncValidationError("plano_id é obrigatório");
    }
    if (!Array.isArray(filiais_ids) || filiais_ids.length === 0) {
      throw new SyncValidationError("É necessário selecionar pelo menos uma licença (filial)");
    }

    // Busca a licença (plano) selecionada
    const { rows: licencaRows } = await pool.query(
      `SELECT id, nome, valor FROM core.licencas WHERE id = $1 AND ativo = true`,
      [plano_id]
    );
    if (licencaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Plano de licença não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const licenca = licencaRows[0];

    // Busca o handle da InfinitePay do Master
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

    // Busca as filiais informadas, certificando que elas existem
    const filiaisClean = filiais_ids.filter((id): id is string => typeof id === 'string');
    const placeholders = filiaisClean.map((_, i) => `$${i + 1}`).join(",");
    const { rows: filiaisEncontradas } = await pool.query(
      `SELECT f.id, f.empresa_id, f.nome
       FROM core.filiais f
       WHERE f.id IN (${placeholders})`,
      filiaisClean
    );

    if (filiaisEncontradas.length !== filiaisClean.length) {
      return new Response(JSON.stringify({ error: "Uma ou mais filiais selecionadas não foram encontradas" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const loteId = randomUUID();
    const appUrl = process.env.APP_URL?.replace(/\/$/, "");
    const precoUnitario = Number(licenca.valor);
    const precoCentavos = Math.round(precoUnitario * 100);
    const totalCentavos = precoCentavos * filiaisEncontradas.length;

    // Transação para inserir todos os pedidos vinculados ao mesmo lote_id
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const filial of filiaisEncontradas) {
        const pedidoId = randomUUID();
        // empresa_id do pedido é o empresa_id da filial (cliente final)
        await client.query(
          `INSERT INTO core.pedidos_licenca (id, lote_id, revenda_id, empresa_id, filial_id, licenca_id, valor)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [pedidoId, loteId, revenda_id, filial.empresa_id, filial.id, licenca.id, precoUnitario]
        );
      }
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // Gera o link de checkout agrupado (loteId)
    try {
      const link = await criarLinkPagamento({
        handle,
        items: [{ quantity: filiaisEncontradas.length, price: precoCentavos, description: `Renovação: ${licenca.nome}` }],
        orderNsu: loteId,
        redirectUrl: appUrl ? `${appUrl}/painel/faturas` : undefined,
        webhookUrl: appUrl ? `${appUrl}/api/webhooks/infinitepay` : undefined,
        paymentMethod: metodo_pagamento === "cartao" ? "credit_card" : "pix",
      });

      // Atualiza os pedidos do lote com as informações do link
      await pool.query(
        `UPDATE core.pedidos_licenca
         SET checkout_url = $1, invoice_slug = $2
         WHERE lote_id = $3`,
        [link.checkoutUrl, link.slug, loteId]
      );

      return new Response(JSON.stringify({ checkout_url: link.checkoutUrl }), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      });
    } catch (linkError) {
      // Cancela todos os pedidos do lote se falhar
      await pool.query(`UPDATE core.pedidos_licenca SET status = 'cancelado' WHERE lote_id = $1`, [loteId]);
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

