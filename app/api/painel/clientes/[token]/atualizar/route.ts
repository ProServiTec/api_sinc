import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { decryptToken } from "@/lib/clientsLink";

/**
 * Botão "Atualizar" na tela do cliente: enfileira um comando de sincronização
 * para cada filial do cliente. O sincronizador consome isso em
 * GET /api/sync/comandos na próxima vez que rodar seu ciclo normal — não é
 * instantâneo, depende de com que frequência ele consulta a fila.
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

  const { revenda_id } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof revenda_id !== "string" || revenda_id.trim() === "") {
      throw new SyncValidationError("revenda_id é obrigatório");
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

    const { rows: filiaisRows } = await pool.query(
      `SELECT id FROM core.filiais WHERE empresa_id = $1 AND ativo = true`,
      [clienteId]
    );

    if (filiaisRows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Este cliente ainda não tem nenhuma filial ativa para atualizar" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    // Não empilha um novo comando pendente em cima de outro que o
    // sincronizador ainda nem buscou.
    await pool.query(
      `INSERT INTO core.comandos_sincronizacao (filial_id)
       SELECT f.id FROM core.filiais f
       WHERE f.empresa_id = $1 AND f.ativo = true
         AND NOT EXISTS (
           SELECT 1 FROM core.comandos_sincronizacao c
           WHERE c.filial_id = f.id AND c.status = 'pendente'
         )`,
      [clienteId]
    );

    return new Response(JSON.stringify({ solicitado: true, filiais: filiaisRows.length }), {
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
