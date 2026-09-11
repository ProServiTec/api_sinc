import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

const PERIODICIDADES = new Set(["mensal", "anual"]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const { nome, descricao, valor, periodicidade, dia_fechamento, ativo } = (body ?? {}) as Record<
    string,
    unknown
  >;

  try {
    if (typeof nome !== "string" || nome.trim() === "") {
      throw new SyncValidationError("nome é obrigatório");
    }
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor <= 0) {
      throw new SyncValidationError("valor é obrigatório e deve ser maior que zero");
    }
    if (typeof periodicidade !== "string" || !PERIODICIDADES.has(periodicidade)) {
      throw new SyncValidationError("periodicidade deve ser 'mensal' ou 'anual'");
    }
    if (
      typeof dia_fechamento !== "number" ||
      !Number.isInteger(dia_fechamento) ||
      dia_fechamento < 1 ||
      dia_fechamento > 31
    ) {
      throw new SyncValidationError("dia_fechamento é obrigatório e deve ser um dia entre 1 e 31");
    }
    if (descricao !== undefined && descricao !== null && typeof descricao !== "string") {
      throw new SyncValidationError("descricao inválida");
    }
    if (typeof ativo !== "boolean") {
      throw new SyncValidationError("ativo é obrigatório");
    }

    const { rows } = await pool.query(
      `UPDATE core.licencas
       SET nome = $1, descricao = $2, valor = $3, periodicidade = $4, dia_fechamento = $5,
           ativo = $6, updated_at = now()
       WHERE id = $7
       RETURNING id, nome, descricao, valor, periodicidade, dia_fechamento, ativo, created_at, updated_at`,
      [nome.trim(), (descricao as string | undefined)?.trim() || null, valor, periodicidade, dia_fechamento, ativo, id]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Licença não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ licenca: rows[0] }), {
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

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { rows } = await pool.query(`DELETE FROM core.licencas WHERE id = $1 RETURNING id`, [id]);

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Licença não encontrada" }), {
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
