export class SyncValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SyncValidationError";
  }
}

interface PgLikeError {
  code?: string;
  message?: string;
  detail?: string;
  constraint?: string;
  table?: string;
  column?: string;
}

export interface ClassifiedError {
  status: number;
  tipo:
    | "validacao"
    | "conflito_banco"
    | "conexao_banco"
    | "erro_banco"
    | "erro_interno";
  error: string;
  codigo_postgres?: string;
  detalhe_postgres?: string;
  constraint?: string;
}

const CONNECTION_ERROR_CODES = new Set([
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
  "ECONNRESET",
]);

export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof SyncValidationError) {
    return { status: 400, tipo: "validacao", error: error.message };
  }

  if (error && typeof error === "object" && "code" in error) {
    const e = error as PgLikeError;
    const code = e.code ?? "";

    if (CONNECTION_ERROR_CODES.has(code)) {
      return {
        status: 503,
        tipo: "conexao_banco",
        error: "Não foi possível conectar ao banco de dados",
        codigo_postgres: code,
      };
    }

    // SQLSTATE codes do Postgres têm sempre 5 caracteres (ex: 23503, 23505, 42501)
    if (/^[0-9A-Z]{5}$/.test(code)) {
      if (code === "23503") {
        return {
          status: 409,
          tipo: "conflito_banco",
          error: "Referência inexistente (empresa/filial/dispositivo não cadastrado)",
          codigo_postgres: code,
          detalhe_postgres: e.detail,
          constraint: e.constraint,
        };
      }
      if (code === "23505") {
        return {
          status: 409,
          tipo: "conflito_banco",
          error: "Violação de unicidade no banco de dados",
          codigo_postgres: code,
          detalhe_postgres: e.detail,
          constraint: e.constraint,
        };
      }
      if (code === "42501") {
        return {
          status: 500,
          tipo: "erro_banco",
          error: "Permissão negada no banco de dados para esta operação",
          codigo_postgres: code,
        };
      }
      if (code.startsWith("08")) {
        return {
          status: 503,
          tipo: "conexao_banco",
          error: "Erro de conexão com o banco de dados",
          codigo_postgres: code,
        };
      }
      if (code.startsWith("42")) {
        return {
          status: 500,
          tipo: "erro_banco",
          error: "Erro de sintaxe/schema na query (bug na API, não no envio de dados)",
          codigo_postgres: code,
          detalhe_postgres: e.detail,
        };
      }
      return {
        status: 500,
        tipo: "erro_banco",
        error: e.message ?? "Erro no banco de dados",
        codigo_postgres: code,
        detalhe_postgres: e.detail,
        constraint: e.constraint,
      };
    }
  }

  return {
    status: 500,
    tipo: "erro_interno",
    error: error instanceof Error ? error.message : "Erro desconhecido",
  };
}
