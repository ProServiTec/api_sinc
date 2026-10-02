-- Modelo estruturado de notas fiscais (base dos relatórios fiscais no Gestor).
--
-- Contexto: os XMLs de NF-e/NFC-e já chegam à nuvem em pdv.nota_fiscal (saída)
-- e pdv.nota_fiscal_compra (entrada), guardados como bytea/base64. O item a
-- item (det/prod) só existe dentro do XML. Para (a) alimentar os relatórios sem
-- reparsear e (b) permitir descartar o blob de XML depois do envio mensal ao
-- contador, materializamos aqui o cabeçalho e os itens já parseados.
--
-- Preenchimento: feito pela aplicação (lib/fiscal/ingest.ts), que lê as tabelas
-- pdv.*, parseia o XML (lib/fiscal/xmlParser.ts) e faz upsert nestas tabelas.
--
-- Rode com um usuário que tenha permissão de CREATE TABLE em core (o usuário da
-- aplicação "api_sinc_app" não tem essa permissão; use postgres/superusuário).

BEGIN;

-- Cabeçalho unificado (entrada + saída), independente das tabelas pdv.* para
-- que os relatórios continuem funcionando mesmo após o XML bruto ser purgado.
CREATE TABLE IF NOT EXISTS core.fiscal_nota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id) ON DELETE CASCADE,
  filial_id uuid REFERENCES core.filiais(id) ON DELETE SET NULL,
  source_database text,
  direcao text NOT NULL CHECK (direcao IN ('entrada', 'saida')),
  chave_acesso text,
  numero bigint,
  serie bigint,
  modelo text,                 -- 55 = NF-e, 65 = NFC-e (quando disponível)
  tipo text,                   -- "NF-e" | "NFC-e" | ... (derivado do modelo)
  data_emissao timestamptz,
  competencia date,            -- 1º dia do mês de emissão (facilita filtro mensal)
  valor_total numeric(14, 2),
  situacao bigint,
  origem_tabela text NOT NULL, -- 'pdv.nota_fiscal' | 'pdv.nota_fiscal_compra'
  origem_row_id bigint,        -- _zaya_row_id de origem
  itens_qtd integer NOT NULL DEFAULT 0,
  xml_disponivel boolean NOT NULL DEFAULT true, -- false após purga do blob (A5)
  parseado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uma nota (por empresa + direção + chave) é única -> upsert idempotente.
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_nota_chave_uk
  ON core.fiscal_nota (empresa_id, direcao, chave_acesso)
  WHERE chave_acesso IS NOT NULL;

CREATE INDEX IF NOT EXISTS fiscal_nota_competencia_idx
  ON core.fiscal_nota (empresa_id, competencia, direcao);

CREATE INDEX IF NOT EXISTS fiscal_nota_filial_idx
  ON core.fiscal_nota (filial_id);

-- Itens (det/prod) parseados do XML.
CREATE TABLE IF NOT EXISTS core.fiscal_nota_item (
  id bigserial PRIMARY KEY,
  fiscal_nota_id uuid NOT NULL REFERENCES core.fiscal_nota(id) ON DELETE CASCADE,
  n_item integer,
  c_prod text,
  x_prod text,
  ncm text,
  cfop text,
  q_com numeric(18, 4),
  v_un_com numeric(18, 6),
  v_prod numeric(14, 2)
);

CREATE INDEX IF NOT EXISTS fiscal_nota_item_nota_idx
  ON core.fiscal_nota_item (fiscal_nota_id);

CREATE INDEX IF NOT EXISTS fiscal_nota_item_ncm_idx
  ON core.fiscal_nota_item (ncm);

-- Permissões para o usuário da aplicação (prod: api_sinc_app; local: zaya_cloud_admin).
GRANT SELECT, INSERT, UPDATE, DELETE ON core.fiscal_nota, core.fiscal_nota_item TO api_sinc_app;
GRANT USAGE, SELECT ON SEQUENCE core.fiscal_nota_item_id_seq TO api_sinc_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON core.fiscal_nota, core.fiscal_nota_item TO zaya_cloud_admin;
GRANT USAGE, SELECT ON SEQUENCE core.fiscal_nota_item_id_seq TO zaya_cloud_admin;

COMMIT;
