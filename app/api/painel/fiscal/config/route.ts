import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { smtpConfigurado } from "@/lib/fiscal/email";

/**
 * Configuração fiscal por empresa (e-mail do contador + envio automático).
 * GET  ?empresa_id&revenda_id  -> { config, smtpConfigurado }
 * PUT  { empresa_id, revenda_id, contador_email, contador_nome, envio_automatico, dia_envio }
 * Escopo: a empresa precisa pertencer à revenda.
 */

async function empresaDaRevenda(empresaId: string, revendaId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM core.empresas WHERE id = $1 AND revenda_id = $2`,
    [empresaId, revendaId]
  );
  return rows.length > 0;
}

export async function GET(request: NextRequest) {
  const empresaId = request.nextUrl.searchParams.get("empresa_id");
  const revendaId = request.nextUrl.searchParams.get("revenda_id");
  try {
    if (!empresaId || !revendaId) throw new SyncValidationError("empresa_id e revenda_id são obrigatórios");
    if (!(await empresaDaRevenda(empresaId, revendaId))) return json({ error: "Empresa não encontrada" }, 404);

    const { rows } = await pool.query(
      `SELECT contador_email, contador_nome, envio_automatico, dia_envio
       FROM core.fiscal_config WHERE empresa_id = $1`,
      [empresaId]
    );
    const config = rows[0] ?? {
      contador_email: null,
      contador_nome: null,
      envio_automatico: false,
      dia_envio: 5,
    };
    return json({ config, smtpConfigurado: smtpConfigurado() });
  } catch (error) {
    const c = classifyError(error);
    return json(c, c.status);
  }
}

export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const c = classifyError(new SyncValidationError("Invalid JSON body"));
    return json(c, c.status);
  }
  const { empresa_id, revenda_id, contador_email, contador_nome, envio_automatico, dia_envio } =
    (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof empresa_id !== "string" || typeof revenda_id !== "string") {
      throw new SyncValidationError("empresa_id e revenda_id são obrigatórios");
    }
    if (!(await empresaDaRevenda(empresa_id, revenda_id))) {
      return json({ error: "Empresa não encontrada" }, 404);
    }
    const email = typeof contador_email === "string" ? contador_email.trim() || null : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new SyncValidationError("E-mail do contador inválido");
    }
    const nome = typeof contador_nome === "string" ? contador_nome.trim() || null : null;
    const auto = envio_automatico === true;
    const dia = Math.min(28, Math.max(1, Number(dia_envio) || 5));

    await pool.query(
      `INSERT INTO core.fiscal_config (empresa_id, contador_email, contador_nome, envio_automatico, dia_envio, updated_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (empresa_id) DO UPDATE SET
         contador_email = EXCLUDED.contador_email,
         contador_nome = EXCLUDED.contador_nome,
         envio_automatico = EXCLUDED.envio_automatico,
         dia_envio = EXCLUDED.dia_envio,
         updated_at = now()`,
      [empresa_id, email, nome, auto, dia]
    );
    return json({ ok: true });
  } catch (error) {
    const c = classifyError(error);
    return json(c, c.status);
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
