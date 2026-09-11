import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const empresaId = request.nextUrl.searchParams.get("empresa_id");

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const { rows } = await pool.query(
      `SELECT e.id, mc.chave_pix
       FROM core.empresas e
       LEFT JOIN core.master_config mc ON mc.empresa_id = e.id
       WHERE e.id = $1 AND e.is_master = true`,
      [empresaId]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Empresa master não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ chave_pix: rows[0].chave_pix }), {
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

export async function PATCH(request: NextRequest) {
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

  const { empresa_id, chave_pix } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof empresa_id !== "string" || empresa_id.trim() === "") {
      throw new SyncValidationError("empresa_id é obrigatório");
    }
    if (typeof chave_pix !== "string" || chave_pix.trim() === "") {
      throw new SyncValidationError("chave_pix é obrigatória");
    }

    const { rows: empresaRows } = await pool.query(
      `SELECT id FROM core.empresas WHERE id = $1 AND is_master = true`,
      [empresa_id]
    );

    if (empresaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Empresa master não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO core.master_config (empresa_id, chave_pix)
       VALUES ($1, $2)
       ON CONFLICT (empresa_id) DO UPDATE SET chave_pix = EXCLUDED.chave_pix, updated_at = now()
       RETURNING chave_pix`,
      [empresa_id, chave_pix.trim()]
    );

    return new Response(JSON.stringify({ chave_pix: rows[0].chave_pix }), {
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
