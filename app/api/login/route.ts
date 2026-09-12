import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { verifyPassword } from "@/lib/password";
import { onlyDigits } from "@/lib/cpfCnpj";

const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;
let subcontasCache: { existe: boolean; expiresAt: number } | null = null;

/** true depois que a migração da Fase 2 (core.empresas.senha_temporaria +
 * core.usuarios) já rodou nesta base. Consulta information_schema (nunca
 * falha) em vez de tentar usar a coluna direto — evita derrubar TODO login
 * enquanto a migração não foi aplicada. */
async function suportaSubcontas(): Promise<boolean> {
  if (subcontasCache && subcontasCache.expiresAt > Date.now()) {
    return subcontasCache.existe;
  }

  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = 'empresas' AND column_name = 'senha_temporaria'`
  );

  const existe = rows.length > 0;
  subcontasCache = { existe, expiresAt: Date.now() + SCHEMA_CACHE_TTL_MS };
  return existe;
}

function respostaCredenciaisInvalidas() {
  return new Response(
    JSON.stringify({ status: 401, tipo: "credenciais_invalidas", error: "CPF/CNPJ ou senha inválidos" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
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

  const { cpf_cnpj, senha } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof cpf_cnpj !== "string" || onlyDigits(cpf_cnpj) === "") {
      throw new SyncValidationError("cpf_cnpj é obrigatório");
    }
    if (typeof senha !== "string" || senha === "") {
      throw new SyncValidationError("senha é obrigatória");
    }

    const comSubcontas = await suportaSubcontas();

    const { rows } = await pool.query(
      comSubcontas
        ? `SELECT id, nome, razao_social, cpf_cnpj, ativo, is_admin, is_master, created_at, updated_at,
                  password, senha_temporaria
           FROM core.empresas
           WHERE regexp_replace(cpf_cnpj, '[^0-9]', '', 'g') = $1
             AND ativo = true`
        : `SELECT id, nome, razao_social, cpf_cnpj, ativo, is_admin, is_master, created_at, updated_at, password
           FROM core.empresas
           WHERE regexp_replace(cpf_cnpj, '[^0-9]', '', 'g') = $1
             AND ativo = true`,
      [onlyDigits(cpf_cnpj)]
    );

    const registro = rows[0];
    if (!registro) {
      return respostaCredenciaisInvalidas();
    }

    // 1) Tenta a senha do Usuário Master (dona da empresa).
    if (await verifyPassword(senha, registro.password)) {
      const { password: _password, ...empresa } = registro;
      return new Response(JSON.stringify({ empresa, usuario: null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2) Não bateu com o Master: tenta contra cada subusuário ativo desta empresa
    // (login por CNPJ da empresa + senha própria do subusuário). Só possível
    // depois da migração da Fase 2.
    if (comSubcontas) {
      const { rows: usuarios } = await pool.query(
        `SELECT id, nome, password, acesso_total, pode_ver_dashboards, pode_ver_relatorios,
                pode_lancar_financeiro, pode_editar_excluir
         FROM core.usuarios
         WHERE empresa_id = $1 AND ativo = true`,
        [registro.id]
      );

      for (const usuario of usuarios) {
        if (await verifyPassword(senha, usuario.password)) {
          const { rows: filiaisRows } = usuario.acesso_total
            ? { rows: [] as { filial_id: string }[] }
            : await pool.query(`SELECT filial_id FROM core.usuario_filiais WHERE usuario_id = $1`, [usuario.id]);

          const { password: _password, ...empresa } = registro;
          return new Response(
            JSON.stringify({
              empresa,
              usuario: {
                id: usuario.id,
                nome: usuario.nome,
                acesso_total: usuario.acesso_total,
                filiais: filiaisRows.map((r) => r.filial_id),
                permissoes: {
                  ver_dashboards: usuario.pode_ver_dashboards,
                  ver_relatorios: usuario.pode_ver_relatorios,
                  lancar_financeiro: usuario.pode_lancar_financeiro,
                  editar_excluir: usuario.pode_editar_excluir,
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }

    return respostaCredenciaisInvalidas();
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
