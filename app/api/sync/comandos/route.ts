import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError } from "@/lib/errors";
import { autenticarApiClient } from "@/lib/apiClients";

/**
 * O sincronizador consulta esta rota a cada vez que roda seu ciclo normal
 * (não existe um jeito do servidor "ligar" pra ele — quem inicia o contato é
 * sempre o dispositivo). Se houver comando pendente para a filial do token
 * usado, ele já vem marcado como entregue nesta mesma chamada (fila
 * "pega e consome", sem confirmação separada).
 */
export async function GET(request: NextRequest) {
  const apiClient = await autenticarApiClient(request);
  if (!apiClient) {
    return new Response(
      JSON.stringify({
        status: 401,
        tipo: "nao_autenticado",
        error: "Token de sincronização ausente ou inválido.",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!apiClient.filialId) {
    return new Response(JSON.stringify({ sincronizar_agora: false, comandos: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { rows } = await pool.query(
      `UPDATE core.comandos_sincronizacao
       SET status = 'entregue', entregue_at = now()
       WHERE filial_id = $1 AND status = 'pendente'
       RETURNING id, criado_at`,
      [apiClient.filialId]
    );

    return new Response(
      JSON.stringify({
        sincronizar_agora: rows.length > 0,
        comandos: rows.map((r) => ({ id: r.id, criado_at: r.criado_at })),
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
