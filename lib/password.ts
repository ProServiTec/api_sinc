import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

export async function hashPassword(senha: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scryptAsync(senha, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${derived.toString("hex")}`;
}

// Mesmo alfabeto sem caracteres ambíguos usado pelo código de licença
// (core.novo_codigo_licenca), pra manter consistência visual entre os dois.
const ALFABETO_SENHA = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** Gera uma senha temporária legível (10 caracteres), usada quando o Parceiro
 * cria um Cliente novo: mostrada em texto puro uma única vez na resposta,
 * pro Master trocar (ou manter) no primeiro login. */
export function gerarSenhaTemporaria(): string {
  const bytes = randomBytes(10);
  let senha = "";
  for (let i = 0; i < bytes.length; i++) {
    senha += ALFABETO_SENHA[bytes[i] % ALFABETO_SENHA.length];
  }
  return senha;
}

export async function verifyPassword(senha: string, hash: string): Promise<boolean> {
  const [salt, key] = hash.split(":");
  if (!salt || !key) return false;

  const keyBuffer = Buffer.from(key, "hex");
  const derived = (await scryptAsync(senha, salt, KEY_LENGTH)) as Buffer;

  if (derived.length !== keyBuffer.length) return false;
  return timingSafeEqual(derived, keyBuffer);
}
