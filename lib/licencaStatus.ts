// O sistema não acompanha a transação financeira entre revenda e master, então o
// status é só uma leitura de tempo: cancelada = desativada manualmente pelo master;
// atrasada = já passou um ciclo inteiro (mensal/anual) desde a compra sem renovação.
export const STATUS_LICENCA_SQL = `
  CASE
    WHEN NOT la.ativo THEN 'cancelada'
    WHEN la.created_at + (CASE WHEN l.periodicidade = 'anual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END) < now()
      THEN 'atrasada'
    ELSE 'ativa'
  END
`;
