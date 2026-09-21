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
      `SELECT e.id, mc.infinitepay_handle
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

    return new Response(JSON.stringify({ infinitepay_handle: rows[0].infinitepay_handle }), {
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

  const { empresa_id, infinitepay_handle } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof empresa_id !== "string" || empresa_id.trim() === "") {
      throw new SyncValidationError("empresa_id é obrigatório");
    }
    if (typeof infinitepay_handle !== "string" || infinitepay_handle.trim() === "") {
      throw new SyncValidationError("InfiniteTag é obrigatória");
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

    // handle sem o "$" do início, caso alguém cole a InfiniteTag do app assim
    const handleNormalizado = infinitepay_handle.trim().replace(/^\$/, "");

    // chave_pix não é mais editada por aqui (a InfiniteTag é o que identifica
    // a conta recebedora). Linhas novas entram com '' pra respeitar um
    // eventual NOT NULL da coluna legada; linhas existentes ficam intactas.
    const { rows } = await pool.query(
      `INSERT INTO core.master_config (empresa_id, chave_pix, infinitepay_handle)
       VALUES ($1, '', $2)
       ON CONFLICT (empresa_id) DO UPDATE
         SET infinitepay_handle = EXCLUDED.infinitepay_handle,
             updated_at = now()
       RETURNING infinitepay_handle`,
      [empresa_id, handleNormalizado]
    );

    return new Response(JSON.stringify({ infinitepay_handle: rows[0].infinitepay_handle }), {
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
