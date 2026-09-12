-- Fase 2: credencial Master automática + subusuários com permissão granular
-- por filial/licença.
--
-- - core.empresas.senha_temporaria: true quando a senha foi gerada
--   automaticamente (na criação do cliente pelo Parceiro) e ainda não foi
--   confirmada/trocada pelo Master no primeiro login.
-- - core.empresas.limite_usuarios: quantos subusuários (core.usuarios) esse
--   cliente pode ter. NULL = sem limite.
-- - core.usuarios: subcontas criadas pelo próprio Master (empresa), com
--   login por CNPJ da empresa + senha própria (resolvido em /api/login
--   tentando a senha contra core.empresas.password e, se não bater, contra
--   cada core.usuarios.password da mesma empresa).
-- - core.usuario_filiais: quais filiais (licenças) um subusuário sem
--   acesso_total pode ver.
--
-- Rode com um usuário que tenha permissão de ALTER TABLE/CREATE em core (o
-- usuário da aplicação "zaya_cloud_admin" não tem essa permissão).

BEGIN;

ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS senha_temporaria boolean NOT NULL DEFAULT false;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS limite_usuarios integer;

CREATE TABLE IF NOT EXISTS core.usuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  nome text NOT NULL,
  password text NOT NULL,
  acesso_total boolean NOT NULL DEFAULT false,
  pode_ver_dashboards boolean NOT NULL DEFAULT true,
  pode_ver_relatorios boolean NOT NULL DEFAULT true,
  pode_lancar_financeiro boolean NOT NULL DEFAULT false,
  pode_editar_excluir boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usuarios_empresa_id ON core.usuarios(empresa_id);

CREATE TABLE IF NOT EXISTS core.usuario_filiais (
  usuario_id uuid NOT NULL REFERENCES core.usuarios(id) ON DELETE CASCADE,
  filial_id uuid NOT NULL REFERENCES core.filiais(id) ON DELETE CASCADE,
  PRIMARY KEY (usuario_id, filial_id)
);

COMMIT;
