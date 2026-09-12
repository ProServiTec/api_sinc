import { pool } from "./db";

export interface IdentificacaoFilial {
  razao_social: string | null;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
}

/**
 * Busca a identidade real do negócio (razão social / nome fantasia / CNPJ)
 * assim que o sincronizador já mandou pdv.dados_empresa pelo menos uma vez.
 * Antes da primeira sincronização não há nada pra mostrar (retorna null) —
 * até lá a filial só tem o nome genérico dado na ativação ("Filial 1", etc).
 */
export async function buscarIdentificacaoFilial(
  empresaId: string,
  filialId: string | null
): Promise<IdentificacaoFilial | null> {
  const { rows } = await pool.query(
    `SELECT razao_social, nome AS nome_fantasia, cpf_cnpj
     FROM pdv.dados_empresa
     WHERE _zaya_empresa_id = $1
       AND ($2::uuid IS NULL OR _zaya_filial_id = $2)
       AND data_hora_deletado IS NULL
     ORDER BY _zaya_synced_at DESC
     LIMIT 1`,
    [empresaId, filialId]
  );

  return rows[0] ?? null;
}
