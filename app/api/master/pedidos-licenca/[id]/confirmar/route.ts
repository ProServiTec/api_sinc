import { NextRequest } from "next/server";
import { classifyError } from "@/lib/errors";
import { confirmarPedidoPago } from "@/lib/pedidosLicenca";

/**
 * Confirmação manual de um pedido de licença pelo Master — usada enquanto o
 * webhook da InfinitePay não está configurado (sem domínio de produção
 * ainda), ou como reforço se ele falhar. O Master confere o pagamento no
 * app da InfinitePay e confirma aqui; a licença é criada na hora.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const resultado = await confirmarPedidoPago(id, { confirmadoPor: "manual" });

    if (!resultado.ok) {
      const mensagem =
        resultado.motivo === "pedido_nao_encontrado" ? "Pedido não encontrado" : "Pedido já foi cancelado";
      return new Response(JSON.stringify({ error: mensagem }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, ja_confirmado: resultado.jaConfirmado }), {
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
