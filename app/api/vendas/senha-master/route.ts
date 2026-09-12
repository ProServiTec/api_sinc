import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { hashPassword } from "@/lib/password";

/**
 * Confirmação/troca da senha temporária do Master no primeiro login.
 * Sem nova_senha: só marca senha_temporaria=false (o Master decidiu manter
 * a senha gerada automaticamente). Com nova_senha: também atualiza a senha.
 */
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

  const { empresa_id, nova_senha } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof empresa_id !== "string" || empresa_id.trim() === "") {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    if (nova_senha !== undefined && nova_senha !== null) {
      if (typeof nova_senha !== "string" || nova_senha.length < 6) {
        throw new SyncValidationError("nova_senha deve ter ao menos 6 caracteres");
      }
      const senhaHash = await hashPassword(nova_senha);
      await pool.query(
        `UPDATE core.empresas SET password = $1, senha_temporaria = false, updated_at = now() WHERE id = $2`,
        [senhaHash, empresa_id]
      );
    } else {
      await pool.query(
        `UPDATE core.empresas SET senha_temporaria = false, updated_at = now() WHERE id = $1`,
        [empresa_id]
      );
    }

    return new Response(JSON.stringify({ ok: true }), {
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
