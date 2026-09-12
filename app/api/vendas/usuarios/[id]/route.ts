import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

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

  const {
    empresa_id,
    ativo,
    acesso_total,
    pode_ver_dashboards,
    pode_ver_relatorios,
    pode_lancar_financeiro,
    pode_editar_excluir,
    filiais,
  } = (body ?? {}) as Record<string, unknown>;

  const client = await pool.connect();
  try {
    if (typeof empresa_id !== "string" || empresa_id.trim() === "") {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    await client.query("BEGIN");

    const { rows: usuarioRows } = await client.query(
      `SELECT id FROM core.usuarios WHERE id = $1 AND empresa_id = $2 FOR UPDATE`,
      [id, empresa_id]
    );
    if (usuarioRows.length === 0) {
      throw new SyncValidationError("Usuário não encontrado nesta empresa");
    }

    const campos: string[] = [];
    const valores: unknown[] = [];
    function set(coluna: string, valor: unknown) {
      valores.push(valor);
      campos.push(`${coluna} = $${valores.length}`);
    }

    if (typeof ativo === "boolean") set("ativo", ativo);
    if (typeof acesso_total === "boolean") set("acesso_total", acesso_total);
    if (typeof pode_ver_dashboards === "boolean") set("pode_ver_dashboards", pode_ver_dashboards);
    if (typeof pode_ver_relatorios === "boolean") set("pode_ver_relatorios", pode_ver_relatorios);
    if (typeof pode_lancar_financeiro === "boolean") set("pode_lancar_financeiro", pode_lancar_financeiro);
    if (typeof pode_editar_excluir === "boolean") set("pode_editar_excluir", pode_editar_excluir);

    if (campos.length > 0) {
      set("updated_at", new Date());
      valores.push(id);
      await client.query(
        `UPDATE core.usuarios SET ${campos.join(", ")} WHERE id = $${valores.length}`,
        valores
      );
    }

    if (Array.isArray(filiais)) {
      const filiaisValor = filiais.filter((f): f is string => typeof f === "string");

      const { rows: filiaisValidas } = await client.query(
        `SELECT id FROM core.filiais WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
        [empresa_id, filiaisValor]
      );
      if (filiaisValidas.length !== filiaisValor.length) {
        throw new SyncValidationError("Uma ou mais filiais não pertencem a esta empresa");
      }

      await client.query(`DELETE FROM core.usuario_filiais WHERE usuario_id = $1`, [id]);
      for (const filialId of filiaisValor) {
        await client.query(
          `INSERT INTO core.usuario_filiais (usuario_id, filial_id) VALUES ($1, $2)`,
          [id, filialId]
        );
      }
    }

    await client.query("COMMIT");

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    await client.query("ROLLBACK");
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    client.release();
  }
}

/** Desativa o subusuário (soft delete) — nunca apaga a linha, só bloqueia o login. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const empresaId = request.nextUrl.searchParams.get("empresa_id");

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const { rows } = await pool.query(
      `UPDATE core.usuarios SET ativo = false, updated_at = now()
       WHERE id = $1 AND empresa_id = $2
       RETURNING id`,
      [id, empresaId]
    );

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: "Usuário não encontrado nesta empresa" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
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
