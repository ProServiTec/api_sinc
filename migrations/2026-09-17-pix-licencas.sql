-- Integração de pagamento PIX (InfinitePay) na compra de licença pelo painel
-- do revendedor. Duas mudanças:
--
-- 1) core.master_config ganha a InfiniteTag (handle) da conta InfinitePay que
--    vai RECEBER os pagamentos. É diferente da chave_pix já existente (que é
--    só texto exibido pra repasse manual) — o handle é o identificador usado
--    nas chamadas pra API de checkout da InfinitePay.
--
-- 2) Nova tabela core.pedidos_licenca: registra cada tentativa de compra de
--    licença como um pedido PENDENTE até a InfinitePay confirmar o pagamento
--    (via webhook ou confirmação manual do Master). A licença só é inserida
--    em core.licencas_atribuidas quando o pedido é marcado como pago — antes
--    disso não existe licença nenhuma, só o pedido.
--
-- Rode com um usuário que tenha permissão de CREATE TABLE / ALTER TABLE em
-- core (o usuário da aplicação "zaya_cloud_admin" não tem essa permissão).

BEGIN;

ALTER TABLE core.master_config ADD COLUMN IF NOT EXISTS infinitepay_handle text;

CREATE TABLE IF NOT EXISTS core.pedidos_licenca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
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

COMMIT;
