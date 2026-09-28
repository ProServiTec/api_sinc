import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { decryptToken } from "@/lib/clientsLink";

/**
 * Atribuição de licença pelo Master, direto — sem pedido, sem InfinitePay.
 * O Master é o dono da plataforma, então pode dar uma licença de cortesia
 * pra qualquer cliente sem passar pelo fluxo de pagamento do revendedor.
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

  const { licenca_id } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof licenca_id !== "string" || licenca_id.trim() === "") {
      throw new SyncValidationError("licenca_id é obrigatório");
    }

    const cpfCnpj = decryptToken(token);
    if (!cpfCnpj) {
      throw new SyncValidationError("Link inválido");
    }

    const { rows: clienteRows } = await pool.query(
      `SELECT id, revenda_id FROM core.empresas WHERE cpf_cnpj = $1 AND is_admin = false LIMIT 1`,
      [cpfCnpj]
    );
    if (clienteRows.length === 0) {
      return new Response(JSON.stringify({ error: "Cliente não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    const cliente = clienteRows[0];

    const { rows: licencaRows } = await pool.query(
      `SELECT id, nome FROM core.licencas WHERE id = $1 AND ativo = true`,
      [licenca_id]
    );
    if (licencaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Plano de licença não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Cliente sem revendedor (cadastrado direto pelo Master): a licença fica
    // registrada como concedida pelo próprio Master, não por uma revenda.
    let revendaId = cliente.revenda_id as string | null;
    if (!revendaId) {
      const { rows: masterRows } = await pool.query(
        `SELECT id FROM core.empresas WHERE is_master = true LIMIT 1`
      );
      if (masterRows.length === 0) {
        throw new SyncValidationError("Empresa Master não encontrada");
      }
      revendaId = masterRows[0].id;
    }

    const { rows } = await pool.query(
      `INSERT INTO core.licencas_atribuidas (licenca_id, revenda_id, empresa_id)
       VALUES ($1, $2, $3)
       RETURNING id, codigo, licenca_id, empresa_id, ativo, created_at`,
      [licenca_id, revendaId, cliente.id]
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
