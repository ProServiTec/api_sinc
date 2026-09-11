import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { decryptToken } from "@/lib/clientsLink";

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

    // UPDATE com subquery FOR UPDATE SKIP LOCKED: reserva uma unidade em estoque
    // de forma atômica num único statement, evitando que dois pedidos concorrentes
    // peguem a mesma unidade (pool.query não abre transação entre queries separadas).
    const { rows } = await pool.query(
      `UPDATE core.licencas_atribuidas
       SET empresa_id = $1, updated_at = now()
       WHERE id = (
         SELECT id FROM core.licencas_atribuidas
         WHERE revenda_id = $2 AND licenca_id = $3 AND empresa_id IS NULL AND ativo = true
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, licenca_id, empresa_id, ativo, created_at`,
      [clienteId, revenda_id, licenca_id]
    );

    if (rows.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhuma licença disponível em estoque para esse plano" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ licenca: rows[0] }), {
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
