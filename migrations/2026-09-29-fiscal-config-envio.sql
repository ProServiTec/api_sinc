-- Configuração do envio fiscal ao contador + log de envios.
--
-- fiscal_config: por empresa, o e-mail do contador e a preferência de envio
-- automático (nos primeiros dias do mês). fiscal_envio: registro do que já foi
-- enviado, para o cron não reenviar a mesma competência.
--
-- Rode com um usuário com CREATE TABLE em core (postgres/superusuário;
-- api_sinc_app não tem essa permissão).

BEGIN;

CREATE TABLE IF NOT EXISTS core.fiscal_config (
  empresa_id uuid PRIMARY KEY REFERENCES core.empresas(id) ON DELETE CASCADE,
  contador_email text,
  contador_nome text,
  envio_automatico boolean NOT NULL DEFAULT false,
  dia_envio integer NOT NULL DEFAULT 5 CHECK (dia_envio BETWEEN 1 AND 28),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS core.fiscal_envio (
  id bigserial PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  competencia date NOT NULL,
  destino text,
  total_xmls integer,
  status text NOT NULL CHECK (status IN ('enviado', 'erro')),
  detalhe text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);

-- Impede dois envios "enviado" da mesma competência para a mesma empresa.
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_envio_ok_uk
  ON core.fiscal_envio (empresa_id, competencia)
  WHERE status = 'enviado';

CREATE INDEX IF NOT EXISTS fiscal_envio_empresa_idx
  ON core.fiscal_envio (empresa_id, competencia);

GRANT SELECT, INSERT, UPDATE, DELETE ON core.fiscal_config, core.fiscal_envio TO api_sinc_app;
GRANT USAGE, SELECT ON SEQUENCE core.fiscal_envio_id_seq TO api_sinc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.fiscal_config, core.fiscal_envio TO zaya_cloud_admin;
GRANT USAGE, SELECT ON SEQUENCE core.fiscal_envio_id_seq TO zaya_cloud_admin;

COMMIT;
