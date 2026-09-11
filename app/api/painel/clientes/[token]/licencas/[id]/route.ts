import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { decryptToken } from "@/lib/clientsLink";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ token: string; id: string }> }
) {
  const { token, id } = await params;
  const revendaId = request.nextUrl.searchParams.get("revenda_id");

  try {
    if (!revendaId) {
      throw new SyncValidationError("revenda_id é obrigatório");
    }

    const cpfCnpj = decryptToken(token);
    if (!cpfCnpj) {
      throw new SyncValidationError("Link inválido");
    }

    const { rows: clienteRows } = await pool.query(
      `SELECT id FROM core.empresas WHERE cpf_cnpj = $1 AND is_admin = false AND revenda_id = $2 LIMIT 1`,
      [cpfCnpj, revendaId]
    );
    if (clienteRows.length === 0) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Devolve a licença para o estoque da revenda em vez de apagar: a unidade
    // já foi comprada, só deixa de estar atribuída a este cliente.
    const { rows } = await pool.query(
      `UPDATE core.licencas_atribuidas
       SET empresa_id = NULL, updated_at = now()
       WHERE id = $1 AND empresa_id = $2
       RETURNING id`,
      [id, clienteRows[0].id]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Licença não encontrada para este cliente" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
