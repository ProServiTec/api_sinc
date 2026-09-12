-- Trava "1 licença = 1 banco de dados": cada filial fica amarrada ao id_empresa
-- interno do PDV+ (base_centralizada.id_empresa, já lido pelo SyncEngine.cs e
-- enviado em cada registro como _zaya_source_database). Vários computadores
-- podem sincronizar a mesma filial desde que mandem o MESMO id_empresa — só é
-- bloqueado quando um id_empresa diferente tenta usar a mesma filial/licença.
--
-- Rode com um usuário que tenha permissão de ALTER TABLE em core (o usuário
-- da aplicação "zaya_cloud_admin" não tem essa permissão).

BEGIN;

ALTER TABLE core.filiais ADD COLUMN IF NOT EXISTS pdv_source_database text;

COMMIT;
