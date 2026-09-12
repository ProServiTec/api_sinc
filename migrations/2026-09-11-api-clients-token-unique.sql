-- core.api_clients já existia (empresa_id, filial_id, dispositivo_id, token_hash)
-- mas sem nada garantindo que dois clientes não acabem com o mesmo hash de
-- token. Antes de passar a emitir tokens de verdade (POST /api/sync/licencas/ativar),
-- adiciona a constraint que faz o Postgres recusar essa colisão.
--
-- Rode com um usuário que tenha permissão de ALTER TABLE em core (o usuário
-- da aplicação "zaya_cloud_admin" não tem essa permissão).

BEGIN;

ALTER TABLE core.api_clients
  ADD CONSTRAINT api_clients_token_hash_key UNIQUE (token_hash);

COMMIT;
