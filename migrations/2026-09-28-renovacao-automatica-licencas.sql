-- Renovação automática do plano de licença: configurável na criação e edição
-- do plano em Master → Licenças.
--
-- Rode com um usuário que tenha permissão de ALTER TABLE em core.licencas
-- (dono da tabela; "api_sinc_app" não tem essa permissão, só GRANT
-- explícito na coluna nova).

BEGIN;

ALTER TABLE core.licencas ADD COLUMN IF NOT EXISTS renovacao_automatica boolean NOT NULL DEFAULT true;

GRANT SELECT, UPDATE (renovacao_automatica) ON core.licencas TO api_sinc_app;

COMMIT;
