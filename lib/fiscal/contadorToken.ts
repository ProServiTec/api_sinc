import { decryptToken, encryptToToken } from "@/lib/clientsLink";

/**
 * Token de acesso do contador aos relatórios fiscais de UMA empresa.
 * Reaproveita a cifra AES-GCM de clientsLink, mas com um prefixo de escopo
 * ("fiscal:") para que um token gerado para outro fim (ex.: link de cliente)
 * não sirva aqui, e vice-versa.
 */
const PREFIXO = "fiscal:";

export function gerarTokenContador(empresaId: string): string {
  return encryptToToken(`${PREFIXO}${empresaId}`);
}

/** Retorna o empresa_id se o token for válido e do escopo fiscal; senão null. */
export function lerTokenContador(token: string): string | null {
  const plain = decryptToken(token);
  if (!plain || !plain.startsWith(PREFIXO)) return null;
  const empresaId = plain.slice(PREFIXO.length);
  return empresaId || null;
}
