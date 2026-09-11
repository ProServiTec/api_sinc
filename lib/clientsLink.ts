import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const IV_LENGTH = 12; // padrão para AES-GCM
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const hex = process.env.CLIENTS_LINK_KEY;
  if (!hex) {
    throw new Error("CLIENTS_LINK_KEY não configurada no .env");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error("CLIENTS_LINK_KEY precisa ter 32 bytes (64 caracteres hex)");
  }
  return key;
}

/** Criptografa um texto (ex: cpf_cnpj) em um token base64url seguro para URL. */
export function encryptToToken(texto: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(texto, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

/** Descriptografa um token gerado por encryptToToken. Retorna null se o token
 * for inválido, adulterado ou tiver sido gerado com outra chave. */
export function decryptToken(token: string): string | null {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < IV_LENGTH + AUTH_TAG_LENGTH) return null;

    const iv = raw.subarray(0, IV_LENGTH);
    const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    return null;
  }
}
