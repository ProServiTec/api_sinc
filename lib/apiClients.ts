import { randomBytes, createHash } from "crypto";
import { NextRequest } from "next/server";
import { pool } from "./db";

const TOKEN_PREFIX = "zsync_";

/** Gera um novo token de API em texto puro (mostrado uma única vez ao instalador). */
export function gerarTokenApiClient(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** SHA-256 do token: só o hash é persistido em core.api_clients.token_hash.
 * Não precisa de salt/custo (scrypt) como senha de humano — o token já tem
 * 256 bits de entropia aleatória, então um hash rápido e indexável é o
 * suficiente e é o mesmo padrão usado por Stripe/GitHub para chaves de API. */
export function hashTokenApiClient(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ApiClientAutenticado {
  apiClientId: string;
  empresaId: string;
  filialId: string | null;
}

/** Lê o header "Authorization: Bearer <token>" e resolve o cliente de API
 * correspondente em core.api_clients. Retorna null se o header estiver
 * ausente, malformado, o token não existir ou o cliente estiver inativo. */
export async function autenticarApiClient(request: NextRequest): Promise<ApiClientAutenticado | null> {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return null;

  const tokenHash = hashTokenApiClient(token);

  const { rows } = await pool.query(
    `UPDATE core.api_clients ac
     SET ultimo_uso_at = now()
     WHERE ac.token_hash = $1
       AND ac.ativo = true
       AND (
         ac.filial_id IS NULL
         OR EXISTS (
           SELECT 1
           FROM core.filiais f
           JOIN core.licencas_atribuidas la ON la.filial_id = f.id AND la.ativo = true AND la.empresa_id = ac.empresa_id
           WHERE f.id = ac.filial_id AND f.ativo = true
         )
       )
     RETURNING ac.id, ac.empresa_id, ac.filial_id`,
    [tokenHash]
  );

  const row = rows[0];
  if (!row) return null;

  return { apiClientId: row.id, empresaId: row.empresa_id, filialId: row.filial_id };
}
