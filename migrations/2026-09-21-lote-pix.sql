BEGIN;

ALTER TABLE core.pedidos_licenca ADD COLUMN IF NOT EXISTS lote_id uuid;
ALTER TABLE core.pedidos_licenca ADD COLUMN IF NOT EXISTS filial_id uuid REFERENCES core.filiais(id);

CREATE INDEX IF NOT EXISTS idx_pedidos_licenca_lote ON core.pedidos_licenca(lote_id);

COMMIT;
