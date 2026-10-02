-- Rastreio da purga do XML bruto (A5). Após o pacote ser enviado ao contador e
-- passado o período de carência, os XMLs brutos em pdv.* são descartados
-- (NULL) para liberar disco; os dados estruturados (core.fiscal_nota/item)
-- permanecem para os relatórios.
--
-- Rode com um usuário com ALTER TABLE em core (postgres/superusuário).

BEGIN;

ALTER TABLE core.fiscal_envio ADD COLUMN IF NOT EXISTS xml_purgado boolean NOT NULL DEFAULT false;
ALTER TABLE core.fiscal_envio ADD COLUMN IF NOT EXISTS purgado_em timestamptz;

COMMIT;
