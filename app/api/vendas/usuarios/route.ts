import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { gerarSenhaTemporaria, hashPassword } from "@/lib/password";

/**
 * Subusuários de um Cliente (core.usuarios): criados pelo próprio Master,
 * cada um com acesso a uma ou mais filiais (licenças) e permissões por
 * módulo. Login continua sendo feito com o CNPJ da empresa + a senha
 * própria do subusuário (ver /api/login).
 */
export async function GET(request: NextRequest) {
  const empresaId = request.nextUrl.searchParams.get("empresa_id");

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const [empresaRows, usuarios, filiais] = await Promise.all([
      pool.query(`SELECT limite_usuarios FROM core.empresas WHERE id = $1`, [empresaId]),
      pool.query(
        `SELECT id, nome, acesso_total, pode_ver_dashboards, pode_ver_relatorios,
                pode_lancar_financeiro, pode_editar_excluir, ativo, created_at
         FROM core.usuarios
         WHERE empresa_id = $1
         ORDER BY created_at DESC`,
        [empresaId]
      ),
      pool.query(
        `SELECT uf.usuario_id, uf.filial_id, f.nome AS filial_nome
         FROM core.usuario_filiais uf
         JOIN core.usuarios u ON u.id = uf.usuario_id
         JOIN core.filiais f ON f.id = uf.filial_id
         WHERE u.empresa_id = $1`,
        [empresaId]
      ),
    ]);

    const filiaisPorUsuario = new Map<string, { filial_id: string; filial_nome: string }[]>();
    for (const row of filiais.rows) {
      const lista = filiaisPorUsuario.get(row.usuario_id) ?? [];
      lista.push({ filial_id: row.filial_id, filial_nome: row.filial_nome });
      filiaisPorUsuario.set(row.usuario_id, lista);
    }

    return new Response(
      JSON.stringify({
        limite_usuarios: empresaRows.rows[0]?.limite_usuarios ?? null,
        total_usuarios: usuarios.rows.length,
        usuarios: usuarios.rows.map((u) => ({ ...u, filiais: filiaisPorUsuario.get(u.id) ?? [] })),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
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

  const {
    empresa_id,
    nome,
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
    if (typeof nome !== "string" || nome.trim() === "") {
      throw new SyncValidationError("nome é obrigatório");
    }
    const acessoTotalValor = acesso_total === true;
    const filiaisValor = Array.isArray(filiais) ? filiais.filter((f): f is string => typeof f === "string") : [];
    if (!acessoTotalValor && filiaisValor.length === 0) {
      throw new SyncValidationError("Selecione ao menos uma filial, ou marque acesso total");
    }

    await client.query("BEGIN");

    const { rows: empresaRows } = await client.query(
      `SELECT limite_usuarios FROM core.empresas WHERE id = $1 FOR UPDATE`,
      [empresa_id]
    );
    if (empresaRows.length === 0) {
      throw new SyncValidationError("Empresa não encontrada");
    }
    const limite = empresaRows[0].limite_usuarios as number | null;

    if (limite !== null) {
      const { rows: contagem } = await client.query(
        `SELECT count(*)::int AS total FROM core.usuarios WHERE empresa_id = $1 AND ativo = true`,
        [empresa_id]
      );
      if (contagem[0].total >= limite) {
        await client.query("ROLLBACK");
        return new Response(
          JSON.stringify({ error: `Limite de ${limite} usuário(s) atingido para esta empresa` }),
          { status: 409, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    if (!acessoTotalValor) {
      const { rows: filiaisValidas } = await client.query(
        `SELECT id FROM core.filiais WHERE empresa_id = $1 AND id = ANY($2::uuid[])`,
        [empresa_id, filiaisValor]
      );
      if (filiaisValidas.length !== filiaisValor.length) {
        throw new SyncValidationError("Uma ou mais filiais não pertencem a esta empresa");
      }
    }

    const senha = gerarSenhaTemporaria();
    const senhaHash = await hashPassword(senha);

    const { rows: novoUsuario } = await client.query(
      `INSERT INTO core.usuarios
         (empresa_id, nome, password, acesso_total, pode_ver_dashboards, pode_ver_relatorios,
          pode_lancar_financeiro, pode_editar_excluir)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nome, acesso_total, pode_ver_dashboards, pode_ver_relatorios,
                 pode_lancar_financeiro, pode_editar_excluir, ativo, created_at`,
      [
        empresa_id,
        nome.trim(),
        senhaHash,
        acessoTotalValor,
        pode_ver_dashboards !== false,
        pode_ver_relatorios !== false,
        pode_lancar_financeiro === true,
        pode_editar_excluir === true,
      ]
    );

    if (!acessoTotalValor) {
      for (const filialId of filiaisValor) {
        await client.query(
          `INSERT INTO core.usuario_filiais (usuario_id, filial_id) VALUES ($1, $2)`,
          [novoUsuario[0].id, filialId]
        );
      }
    }

    await client.query("COMMIT");

    // Senha em texto puro só existe aqui — o banco guarda só o hash.
    return new Response(JSON.stringify({ usuario: novoUsuario[0], senha }), {
      status: 201,
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
