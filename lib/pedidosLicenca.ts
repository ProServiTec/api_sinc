import { pool } from "@/lib/db";

type ConfirmarResultado =
  | { ok: true; jaConfirmado: true }
  | { ok: true; jaConfirmado: false; licencaAtribuidaId: string }
  | { ok: false; motivo: "pedido_nao_encontrado" | "pedido_cancelado" };

/**
 * Marca um pedido de licença como pago e SÓ NESSE MOMENTO cria a licença em
 * core.licencas_atribuidas — antes disso o cliente não tem licença nenhuma,
 * só o pedido pendente. Idempotente: chamar de novo pra um pedido já pago
 * não duplica a licença.
 */
export async function confirmarPedidoPago(
  pedidoId: string,
  opts: { confirmadoPor: "webhook" | "manual"; transactionNsu?: string | null }
): Promise<ConfirmarResultado> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: pedidoRows } = await client.query(
      `SELECT id, revenda_id, empresa_id, filial_id, licenca_id, status
       FROM core.pedidos_licenca
       WHERE id = $1
       FOR UPDATE`,
      [pedidoId]
    );

    if (pedidoRows.length === 0) {
      await client.query("ROLLBACK");
      return { ok: false, motivo: "pedido_nao_encontrado" };
    }

    const pedido = pedidoRows[0];

    if (pedido.status === "pago" || pedido.status === "confirmado") {
      await client.query("ROLLBACK");
      return { ok: true, jaConfirmado: true };
    }

    if (pedido.status === "cancelado") {
      await client.query("ROLLBACK");
      return { ok: false, motivo: "pedido_cancelado" };
    }

    // Se o pedido tiver filial_id (pagamento em lote), a licença já é atribuída direto à filial
    const { rows: licencaRows } = await client.query(
      `INSERT INTO core.licencas_atribuidas (licenca_id, revenda_id, empresa_id, filial_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [pedido.licenca_id, pedido.revenda_id, pedido.empresa_id, pedido.filial_id ?? null]
    );

    await client.query(
      `UPDATE core.pedidos_licenca
       SET status = 'pago',
           paid_at = now(),
           transaction_nsu = COALESCE($2, transaction_nsu),
           licenca_atribuida_id = $3,
           confirmed_at = now(),
           updated_at = now(),
           payload_infinitepay = COALESCE(payload_infinitepay, '{}'::jsonb) || jsonb_build_object('confirmado_por', $4::text)
       WHERE id = $1`,
      [pedidoId, opts.transactionNsu ?? null, licencaRows[0].id, opts.confirmadoPor]
    );

    await client.query("COMMIT");
    return { ok: true, jaConfirmado: false, licencaAtribuidaId: licencaRows[0].id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
