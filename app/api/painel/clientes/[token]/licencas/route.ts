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

    const { rows: licencaRows } = await pool.query(
      `SELECT id FROM core.licencas WHERE id = $1 AND ativo = true`,
      [licenca_id]
    );
    if (licencaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Plano de licença não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Compra e atribui numa única unidade nova para este cliente — sem passar por
    // estoque intermediário (o parceiro compra a licença já direto pro cliente).
    const { rows } = await pool.query(
      `INSERT INTO core.licencas_atribuidas (licenca_id, revenda_id, empresa_id)
       VALUES ($1, $2, $3)
       RETURNING id, licenca_id, empresa_id, ativo, created_at`,
      [licenca_id, revenda_id, clienteId]
    );

    return new Response(JSON.stringify({ licenca: rows[0] }), {
      status: 201,
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
