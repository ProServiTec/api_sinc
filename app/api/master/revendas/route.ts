import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";
import { onlyDigits } from "@/lib/cpfCnpj";

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, razao_social, cpf_cnpj, ativo, created_at
       FROM core.empresas
       WHERE is_admin = true AND is_master = false
       ORDER BY created_at DESC`
    );

    return new Response(JSON.stringify({ revendas: rows }), {
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

  const { nome, razao_social, cpf_cnpj, senha } = (body ?? {}) as Record<string, unknown>;

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

    const senhaHash = await hashPassword(senha);

    // is_admin = true e is_master = false: uma Revenda, nunca outra Master.
    const { rows } = await pool.query(
      `INSERT INTO core.empresas (nome, razao_social, cpf_cnpj, password, is_admin, is_master)
       VALUES ($1, $2, $3, $4, true, false)
       RETURNING id, nome, razao_social, cpf_cnpj, ativo, created_at`,
      [nome.trim(), razao_social.trim(), onlyDigits(cpf_cnpj), senhaHash]
    );

    return new Response(JSON.stringify({ revenda: rows[0] }), {
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
