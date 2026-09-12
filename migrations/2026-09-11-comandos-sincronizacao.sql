-- Fila de comandos para o sincronizador. Como o sincronizador só fala com o
-- servidor por iniciativa própria (nunca o contrário), esta tabela é o jeito
-- do painel "avisar" uma instalação específica: o painel insere uma linha
-- pendente, e o sincronizador, a cada vez que roda seu ciclo normal, consulta
-- GET /api/sync/comandos (autenticado pelo próprio token) e marca como
-- entregue o que encontrar.
--
-- Tabela nova, dona por zaya_cloud_admin (sem depender de permissão do
-- usuário postgres).

BEGIN;

CREATE TABLE IF NOT EXISTS core.comandos_sincronizacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filial_id uuid NOT NULL REFERENCES core.filiais(id),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'entregue')),
  criado_at timestamptz NOT NULL DEFAULT now(),
  entregue_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_comandos_sincronizacao_filial_pendente
  ON core.comandos_sincronizacao (filial_id)
  WHERE status = 'pendente';

COMMIT;
