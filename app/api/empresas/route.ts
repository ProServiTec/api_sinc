import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { onlyDigits } from "@/lib/cpfCnpj";

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

  const { nome, razao_social, cpf_cnpj, senha, revenda_id } = (body ?? {}) as Record<string, unknown>;

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
    if (typeof senha !== "string" || senha.length < 6) {
      throw new SyncValidationError("senha é obrigatória e deve ter ao menos 6 caracteres");
    }
    if (revenda_id !== undefined && revenda_id !== null && typeof revenda_id !== "string") {
      throw new SyncValidationError("revenda_id inválido");
    }

    // Cadastro feito pelo painel de uma revenda: o cliente fica vinculado a ela.
    // Cadastro feito pelo painel Master (sem revenda_id): cliente fica sem dono.
    if (typeof revenda_id === "string" && revenda_id.trim() !== "") {
      const { rows: revendaRows } = await pool.query(
        `SELECT id FROM core.empresas WHERE id = $1 AND is_admin = true AND ativo = true`,
        [revenda_id]
      );
      if (revendaRows.length === 0) {
        throw new SyncValidationError("Revenda inválida");
      }
    }

    const senhaHash = await hashPassword(senha);
    const revendaIdValor = typeof revenda_id === "string" && revenda_id.trim() !== "" ? revenda_id : null;

    const { rows } = await pool.query(
      `INSERT INTO core.empresas (nome, razao_social, cpf_cnpj, password, revenda_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, razao_social, cpf_cnpj, ativo, created_at, updated_at`,
      [nome.trim(), razao_social.trim(), onlyDigits(cpf_cnpj), senhaHash, revendaIdValor]
    );

    return new Response(JSON.stringify({ empresa: rows[0] }), {
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
