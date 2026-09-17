import { NextRequest } from "next/server";
import { pool } from "@/lib/db";

/**
 * Rota TEMPORÁRIA pra rodar a migration do pagamento PIX (2026-09-17-pix-licencas.sql)
 * sem precisar de acesso SSH/psql direto no banco de produção — usa a mesma
 * conexão (DATABASE_URL) que o resto do app já usa no dia a dia.
 *
 * Protegida pela variável de ambiente ADMIN_MIGRATION_KEY (definida só no .env
 * da VPS, nunca commitada) — sem ela configurada, a rota recusa qualquer
 * chamada. Depois de confirmar que rodou com sucesso (resposta { ok: true }),
 * APAGUE esta pasta (app/api/admin/migrar-pix), remova a variável do .env e
 * faça um novo deploy — não é pra ficar em produção permanentemente.
 *
 * Idempotente: pode chamar mais de uma vez sem problema (tudo é IF NOT EXISTS).
 */

const SQL = `
ALTER TABLE core.master_config ADD COLUMN IF NOT EXISTS infinitepay_handle text;

CREATE TABLE IF NOT EXISTS core.pedidos_licenca (
  id uuid PRIMARY KEY,
  revenda_id uuid NOT NULL REFERENCES core.empresas(id),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  licenca_id uuid NOT NULL REFERENCES core.licencas(id),
  valor numeric(10,2) NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'pago', 'cancelado')),
  checkout_url text,
  invoice_slug text,
  transaction_nsu text,
  licenca_atribuida_id uuid REFERENCES core.licencas_atribuidas(id),
  confirmado_por text CHECK (confirmado_por IN ('webhook', 'manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_pedidos_licenca_status ON core.pedidos_licenca(status);
CREATE INDEX IF NOT EXISTS idx_pedidos_licenca_revenda ON core.pedidos_licenca(revenda_id);
CREATE INDEX IF NOT EXISTS idx_pedidos_licenca_empresa ON core.pedidos_licenca(empresa_id);
`;

async function executar(request: NextRequest) {
  const chaveEsperada = process.env.ADMIN_MIGRATION_KEY;
  const chave = request.nextUrl.searchParams.get("chave");

  if (!chaveEsperada) {
    return new Response(
      JSON.stringify({ error: "Defina ADMIN_MIGRATION_KEY no .env da VPS antes de usar esta rota" }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }
  if (chave !== chaveEsperada) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await pool.query(SQL);

    const verificacao = await pool.query(`
      SELECT
        to_regclass('core.pedidos_licenca') IS NOT NULL AS tabela_existe,
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'core' AND table_name = 'master_config' AND column_name = 'infinitepay_handle'
        ) AS coluna_existe
    `);

    return new Response(JSON.stringify({ ok: true, verificacao: verificacao.rows[0] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const pgError = error as { message?: string; code?: string; detail?: string };
    return new Response(
      JSON.stringify({
        ok: false,
        erro: pgError.message ?? "Erro desconhecido",
        codigo_postgres: pgError.code,
        detalhe_postgres: pgError.detail,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// GET pra poder rodar só colando a URL no navegador; POST pra quem preferir curl.
export async function GET(request: NextRequest) {
  return executar(request);
}

export async function POST(request: NextRequest) {
  return executar(request);
}
