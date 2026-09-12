// Mesmo alfabeto usado pela trigger core.gerar_codigo_licenca_trigger() para
// gerar o código (sem 0/O, 1/I/L, que se confundem visualmente).
const ALFABETO_VALIDO = /^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{12}$/;

/**
 * Normaliza o código de licença digitado por uma pessoa (maiúsculas, sem
 * espaços/traços) e valida o formato. Retorna o código já formatado como
 * "XXXX-XXXX-XXXX", ou null se o valor não tiver o formato esperado.
 */
export function normalizarCodigoLicenca(valor: string): string | null {
  const limpo = valor.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!ALFABETO_VALIDO.test(limpo)) return null;
  return `${limpo.slice(0, 4)}-${limpo.slice(4, 8)}-${limpo.slice(8, 12)}`;
}
