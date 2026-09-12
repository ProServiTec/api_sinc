Contexto: sistema multi-tenant em Next.js + Postgres (schema `core` para cadastro/licenciamento, schema `pdv` para dados sincronizados dos pontos de venda). Cada empresa cliente (`core.empresas`, is_admin=false) pode ter várias filiais/lojas (`core.filiais`, FK empresa_id) e cada filial pode ter dispositivos (`core.dispositivos`) que sincronizam dados para as tabelas `pdv.*` marcando cada linha com `_zaya_empresa_id` e `_zaya_filial_id`.

As licenças que uma revenda vende para uma empresa ficam em `core.licencas_atribuidas` (colunas: id uuid PK, codigo text unique, licenca_id uuid FK core.licencas, revenda_id uuid FK core.empresas, empresa_id uuid FK core.empresas nullable, ativo boolean, created_at, updated_at). Cada linha tem um código único e permanente (formato tipo "K7XJ-4QR9-TZM2", nunca reaproveitado mesmo se a linha for apagada — já implementado via trigger + tabela ledger `core.licencas_codigos_emitidos`).

Problema a resolver: hoje `core.filiais` não tem nenhum vínculo com `core.licencas_atribuidas`. Preciso que cada licença atribuída a uma empresa corresponda a exatamente uma filial (1 licença = 1 filial = 1 "base" sincronizada), e que o código da licença sirva como chave de ativação: o instalador do PDV numa nova loja informa o código da licença, o backend valida que pertence à empresa e devolve o par (empresa_id, filial_id) que o instalador deve gravar e usar em todo sync futuro.

Tarefa: escreva a migração SQL (não tenho permissão de ALTER TABLE com a credencial de app; a migração será rodada manualmente por um usuário com privilégio de owner) para:
1. Adicionar `filial_id uuid REFERENCES core.filiais(id)` em `core.licencas_atribuidas`, nullable (só é preenchido quando a licença é ativada numa filial) e com constraint UNIQUE (uma filial não pode estar ligada a mais de uma licença, e uma licença não pode estar ligada a mais de uma filial).
2. Garantir com uma CHECK/trigger que `filial_id` só pode ser preenchido quando `empresa_id` também estiver preenchido, e que a filial referenciada pertença à mesma empresa (`core.filiais.empresa_id = core.licencas_atribuidas.empresa_id`).
3. Não alterar nem apagar nenhum dado existente; se houver linhas com empresa_id preenchido e filiais já cadastradas para essa empresa, deixe `filial_id` NULL (não tente adivinhar o vínculo).
4. Escreva o script seguindo o mesmo padrão dos arquivos já existentes em `migrations/` deste projeto (comentários em português explicando o porquê, dentro de BEGIN/COMMIT).

Depois da migração, também preciso dos endpoints da API (Next.js App Router, em `app/api/`) para:
- `POST /api/painel/filiais/ativar` (ou nome equivalente): recebe `{ codigo, nome_filial, cidade, uf }`, busca a licença pelo `codigo` em `core.licencas_atribuidas`, confere que está ativa e sem `filial_id` ainda, cria a filial em `core.filiais` (se não existir) vinculada à `empresa_id` da licença, seta `filial_id` na licença, e retorna `{ empresa_id, filial_id }`.
- Atualizar `GET /api/vendas` para aceitar um parâmetro opcional `filial_id` e, quando presente, adicionar `AND v._zaya_filial_id = $filial_id` (e equivalente nas demais subqueries) em vez de somar todas as filiais da empresa.

Siga os padrões de validação e tratamento de erro já usados no projeto (`classifyError`, `SyncValidationError`, `pool` de `@/lib/db`).
