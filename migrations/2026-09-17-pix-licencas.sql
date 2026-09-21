-- Integração de pagamento PIX (InfinitePay) na compra de licença.
--
-- Este arquivo descreve o esquema que já existe no banco de produção, para
-- documentação e para recriar o ambiente do zero. Em bancos onde a tabela
-- já existe, não altera nada (tudo é IF NOT EXISTS).
--
-- Status do pedido: 'aguardando_pagamento' (padrão) -> 'pago' / 'confirmado'
-- (licença criada em core.licencas_atribuidas) ou 'cancelado'.
-- order_nsu é o identificador único do pedido (igual ao id, gerado pela
-- aplicação). Pedidos de um mesmo checkout em lote compartilham lote_id.

BEGIN;

ALTER TABLE core.master_config ADD COLUMN IF NOT EXISTS infinitepay_handle text;

CREATE TABLE IF NOT EXISTS core.pedidos_licenca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_nsu text NOT NULL UNIQUE,
  revenda_id uuid NOT NULL REFERENCES core.empresas(id),
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  licenca_id uuid NOT NULL REFERENCES core.licencas(id),
  valor numeric NOT NULL,
  status text NOT NULL DEFAULT 'aguardando_pagamento'
    CHECK (status IN ('aguardando_pagamento', 'pago', 'confirmado', 'cancelado')),
  checkout_url text,
  invoice_slug text,
  transaction_nsu text UNIQUE,
  payload_infinitepay jsonb,
  licenca_atribuida_id uuid REFERENCES core.licencas_atribuidas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  lote_id uuid,
  filial_id uuid REFERENCES core.filiais(id)
);

CREATE INDEX IF NOT EXISTS idx_pedidos_licenca_lote ON core.pedidos_licenca(lote_id);

COMMIT;
