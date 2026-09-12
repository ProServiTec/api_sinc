import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

export async function GET(request: NextRequest) {
  const revendaId = request.nextUrl.searchParams.get("revenda_id");

  try {
    if (!revendaId) {
      throw new SyncValidationError("revenda_id é obrigatório");
    }

    const [catalogo, minhas] = await Promise.all([
      pool.query(
        `SELECT id, nome, descricao, valor, periodicidade, dia_fechamento
         FROM core.licencas
         WHERE ativo = true
         ORDER BY nome`
      ),
      pool.query(
        `SELECT la.id, la.codigo, la.licenca_id, l.nome AS licenca_nome, l.valor, l.periodicidade, l.dia_fechamento,
                la.empresa_id, e.nome AS empresa_nome, la.ativo, la.created_at
         FROM core.licencas_atribuidas la
         JOIN core.licencas l ON l.id = la.licenca_id
         LEFT JOIN core.empresas e ON e.id = la.empresa_id
         WHERE la.revenda_id = $1
         ORDER BY la.created_at DESC`,
        [revendaId]
      ),
    ]);

    return new Response(JSON.stringify({ catalogo: catalogo.rows, minhas: minhas.rows }), {
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

  const { revenda_id, licenca_id, quantidade } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof revenda_id !== "string" || revenda_id.trim() === "") {
      throw new SyncValidationError("revenda_id é obrigatório");
    }
    if (typeof licenca_id !== "string" || licenca_id.trim() === "") {
      throw new SyncValidationError("licenca_id é obrigatório");
    }
    const qtd = quantidade ?? 1;
    if (typeof qtd !== "number" || !Number.isInteger(qtd) || qtd < 1 || qtd > 100) {
      throw new SyncValidationError("quantidade deve ser um número inteiro entre 1 e 100");
    }

    const { rows: revendaRows } = await pool.query(
      `SELECT id FROM core.empresas WHERE id = $1 AND is_admin = true AND ativo = true`,
      [revenda_id]
    );
    if (revendaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Parceiro não encontrado" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { rows: licencaRows } = await pool.query(
      `SELECT id FROM core.licencas WHERE id = $1 AND ativo = true`,
      [licenca_id]
    );
    if (licencaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Licença não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO core.licencas_atribuidas (licenca_id, revenda_id)
       SELECT $1, $2 FROM generate_series(1, $3)
       RETURNING id`,
      [licenca_id, revenda_id, qtd]
    );

    return new Response(JSON.stringify({ compradas: rows.length }), {
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
