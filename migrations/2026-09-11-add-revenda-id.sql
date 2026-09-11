-- Cada cliente (core.empresas com is_admin=false) passa a ter um dono: a revenda
-- (core.empresas com is_admin=true) que o cadastrou. Sem isso, toda revenda via
-- os clientes de todas as outras no painel.
--
-- Rode este script com um usuário que tenha permissão de ALTER TABLE em
-- core.empresas (o dono da tabela é "postgres"; o usuário da aplicação
-- "zaya_cloud_admin" não tem essa permissão).

BEGIN;

ALTER TABLE core.empresas ADD COLUMN IF NOT EXISTS revenda_id uuid REFERENCES core.empresas(id);
CREATE INDEX IF NOT EXISTS idx_empresas_revenda_id ON core.empresas(revenda_id);

-- Preenche o dono dos clientes que já têm alguma licença atribuída por uma
-- revenda (usa a atribuição mais antiga como sinal de quem cadastrou o cliente).
UPDATE core.empresas e
SET revenda_id = sub.revenda_id
FROM (
  SELECT DISTINCT ON (empresa_id) empresa_id, revenda_id
  FROM core.licencas_atribuidas
  WHERE empresa_id IS NOT NULL
  ORDER BY empresa_id, created_at
) sub
WHERE e.id = sub.empresa_id AND e.revenda_id IS NULL;

-- Os demais clientes sem licença atribuída (ex.: "teste" e "BIA Pizzas & Salgados")
-- ficam com revenda_id NULL por decisão do usuário: continuam visíveis no painel
-- Master, mas não aparecem em "Meus Clientes" de nenhuma revenda até serem
-- vinculados (ex.: atribuindo uma licença a eles).

COMMIT;
