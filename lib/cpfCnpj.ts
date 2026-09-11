/** Remove tudo que não for dígito (pontos, traço, barra) de um CPF/CNPJ. */
export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}
