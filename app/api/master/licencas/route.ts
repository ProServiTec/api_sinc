import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

const PERIODICIDADES = new Set(["mensal", "anual"]);

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, descricao, valor, periodicidade, dia_fechamento, ativo, created_at, updated_at
       FROM core.licencas
       ORDER BY created_at DESC`
    );

    return new Response(JSON.stringify({ licencas: rows }), {
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

  const { nome, descricao, valor, periodicidade, dia_fechamento } = (body ?? {}) as Record<string, unknown>;

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

    const { rows } = await pool.query(
      `INSERT INTO core.licencas (nome, descricao, valor, periodicidade, dia_fechamento)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nome, descricao, valor, periodicidade, dia_fechamento, ativo, created_at, updated_at`,
      [nome.trim(), (descricao as string | undefined)?.trim() || null, valor, periodicidade, dia_fechamento]
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
