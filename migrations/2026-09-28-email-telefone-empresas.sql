-- E-mail e telefone de contato em core.empresas, usados como:
-- 1) dado de contato do cliente (editável em Novo Cliente / editar cliente)
-- 2) identificador alternativo de login (CPF/CNPJ OU e-mail)
--
-- Rode com um usuário que tenha permissão de ALTER TABLE em core.empresas
-- (dono da tabela; "api_sinc_app"/"zaya_cloud_admin" não tem essa permissão,
-- só GRANT explícito nas colunas novas).

BEGIN;

ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS telefone text;

-- E-mail precisa ser único pra servir como identificador de login sem ambiguidade.
CREATE UNIQUE INDEX IF NOT EXISTS idx_empresas_email_unique
  ON core.empresas (lower(email))
  WHERE email IS NOT NULL;

GRANT SELECT, UPDATE (email, telefone) ON core.empresas TO api_sinc_app;

COMMIT;
