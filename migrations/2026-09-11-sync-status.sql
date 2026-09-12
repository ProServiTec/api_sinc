-- core.dispositivos nunca é populada por nenhum fluxo de sync existente —
-- ficou órfã, sem nada escrevendo nela. Em vez de depender dela para saber
-- "quando foi a última sincronização", esta tabela nova é atualizada
-- diretamente por POST /api/sync/[tabela] toda vez que qualquer dado chega,
-- então reflete a realidade de verdade.
--
-- filial_id pode ser nulo (instalações antigas, de antes do código de
-- licença/ativação, só mandam _zaya_empresa_id). O índice único usa
-- COALESCE porque no Postgres, numa constraint UNIQUE normal, colunas NULL
-- nunca colidem entre si — sem isso o "ON CONFLICT" do upsert não funcionaria
-- para quem não tem filial.

BEGIN;

CREATE TABLE IF NOT EXISTS core.sync_status (
  empresa_id uuid NOT NULL REFERENCES core.empresas(id),
  filial_id uuid REFERENCES core.filiais(id),
  ultima_sincronizacao timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_status_empresa_filial
  ON core.sync_status (empresa_id, COALESCE(filial_id, '00000000-0000-0000-0000-000000000000'::uuid));

COMMIT;
