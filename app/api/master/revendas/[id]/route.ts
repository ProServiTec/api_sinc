import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { STATUS_LICENCA_SQL } from "@/lib/licencaStatus";
import { onlyDigits } from "@/lib/cpfCnpj";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { rows: revendaRows } = await pool.query(
      `SELECT id, nome, razao_social, cpf_cnpj, ativo, created_at
       FROM core.empresas
       WHERE id = $1 AND is_admin = true AND is_master = false`,
      [id]
    );

    if (revendaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Parceiro não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { rows: licencas } = await pool.query(
      `SELECT la.id, la.codigo, la.licenca_id, l.nome AS licenca_nome, l.valor, l.periodicidade, l.dia_fechamento,
              la.empresa_id, e.nome AS empresa_nome, la.ativo, la.created_at,
              (${STATUS_LICENCA_SQL}) AS status
       FROM core.licencas_atribuidas la
       JOIN core.licencas l ON l.id = la.licenca_id
       LEFT JOIN core.empresas e ON e.id = la.empresa_id
       WHERE la.revenda_id = $1
       ORDER BY la.created_at DESC`,
      [id]
    );

    const resumo = {
      total: licencas.length,
      ativas: licencas.filter((l) => l.status === "ativa").length,
      atrasadas: licencas.filter((l) => l.status === "atrasada").length,
      canceladas: licencas.filter((l) => l.status === "cancelada").length,
      em_estoque: licencas.filter((l) => l.empresa_id === null).length,
      atribuidas: licencas.filter((l) => l.empresa_id !== null).length,
    };

    return new Response(
      JSON.stringify({ revenda: revendaRows[0], resumo, licencas }),
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

/** Edita os dados cadastrais do parceiro (nome, razão social, CPF/CNPJ). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const { nome, razao_social, cpf_cnpj } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof nome !== "string" || nome.trim() === "") {
      throw new SyncValidationError("nome é obrigatório");
    }
    if (typeof razao_social !== "string" || razao_social.trim() === "") {
      throw new SyncValidationError("razao_social é obrigatório");
    }
    if (typeof cpf_cnpj !== "string" || onlyDigits(cpf_cnpj) === "") {
      throw new SyncValidationError("cpf_cnpj é obrigatório");
    }

    const { rows } = await pool.query(
      `UPDATE core.empresas
       SET nome = $1, razao_social = $2, cpf_cnpj = $3, updated_at = now()
       WHERE id = $4 AND is_admin = true AND is_master = false
       RETURNING id, nome, razao_social, cpf_cnpj, ativo, created_at`,
      [nome.trim(), razao_social.trim(), onlyDigits(cpf_cnpj), id]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Parceiro não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ revenda: rows[0] }), {
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
