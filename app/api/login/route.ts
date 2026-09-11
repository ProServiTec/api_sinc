import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { verifyPassword } from "@/lib/password";
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

  const { cpf_cnpj, senha } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof cpf_cnpj !== "string" || onlyDigits(cpf_cnpj) === "") {
      throw new SyncValidationError("cpf_cnpj é obrigatório");
    }
    if (typeof senha !== "string" || senha === "") {
      throw new SyncValidationError("senha é obrigatória");
    }

    const { rows } = await pool.query(
      `SELECT id, nome, razao_social, cpf_cnpj, ativo, is_admin, is_master, created_at, updated_at, password
       FROM core.empresas
       WHERE regexp_replace(cpf_cnpj, '[^0-9]', '', 'g') = $1
         AND ativo = true`,
      [onlyDigits(cpf_cnpj)]
    );

    const registro = rows[0];
    const senhaValida = registro ? await verifyPassword(senha, registro.password) : false;

    if (!registro || !senhaValida) {
      return new Response(
        JSON.stringify({
          status: 401,
          tipo: "credenciais_invalidas",
          error: "CPF/CNPJ ou senha inválidos",
        }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- exclui a senha da resposta
    const { password: _password, ...empresa } = registro;

    return new Response(JSON.stringify({ empresa }), {
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
