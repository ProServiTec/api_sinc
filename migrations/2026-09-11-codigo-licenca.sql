-- Cada licença atribuída (core.licencas_atribuidas) passa a ter um código
-- único, visível para a revenda que a comprou e para o Master.
--
-- O código é gerado automaticamente pelo banco (trigger BEFORE INSERT), então
-- nenhuma mudança é necessária na aplicação para criá-lo: toda linha nova em
-- core.licencas_atribuidas já nasce com codigo preenchido.
--
-- Formato: 12 caracteres alfanuméricos em 3 blocos de 4 (ex.: "K7XJ-4QR9-TZM2"),
-- usando um alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L).
--
-- Para garantir que um código jamais se repita mesmo que a licença que o usou
-- seja apagada no futuro, os códigos emitidos ficam registrados numa tabela
-- separada e somente-inserção (core.licencas_codigos_emitidos), que nunca é
-- limpa mesmo que a linha correspondente em licencas_atribuidas seja excluída.
--
-- Rode com um usuário que tenha permissão de ALTER TABLE / CREATE FUNCTION em
-- core (o usuário da aplicação "zaya_cloud_admin" não tem essa permissão).

BEGIN;

CREATE TABLE IF NOT EXISTS core.licencas_codigos_emitidos (
  codigo text PRIMARY KEY,
  criado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE core.licencas_atribuidas ADD COLUMN IF NOT EXISTS codigo text;

CREATE OR REPLACE FUNCTION core.novo_codigo_licenca()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alfabeto text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- sem 0/O, 1/I/L (evita confusão)
  bruto text;
  candidato text;
BEGIN
  LOOP
    SELECT string_agg(substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1), '')
      INTO bruto
      FROM generate_series(1, 12);

    candidato := substr(bruto, 1, 4) || '-' || substr(bruto, 5, 4) || '-' || substr(bruto, 9, 4);

    BEGIN
      INSERT INTO core.licencas_codigos_emitidos (codigo) VALUES (candidato);
      RETURN candidato;
    EXCEPTION WHEN unique_violation THEN
      -- colisão extremamente rara: tenta gerar outro código
      NULL;
    END;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION core.gerar_codigo_licenca_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := core.novo_codigo_licenca();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_codigo_licenca ON core.licencas_atribuidas;
CREATE TRIGGER trg_gerar_codigo_licenca
  BEFORE INSERT ON core.licencas_atribuidas
  FOR EACH ROW
  EXECUTE FUNCTION core.gerar_codigo_licenca_trigger();

-- Backfill das linhas já existentes (compradas antes desta migração).
UPDATE core.licencas_atribuidas
SET codigo = core.novo_codigo_licenca()
WHERE codigo IS NULL;

ALTER TABLE core.licencas_atribuidas ALTER COLUMN codigo SET NOT NULL;
ALTER TABLE core.licencas_atribuidas
  ADD CONSTRAINT licencas_atribuidas_codigo_key UNIQUE (codigo);

COMMIT;
