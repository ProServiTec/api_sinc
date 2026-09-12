import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { gerarSenhaTemporaria, hashPassword } from "@/lib/password";
import { onlyDigits } from "@/lib/cpfCnpj";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    const classified = classifyError(new SyncValidationError("Invalid JSON body"));
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { nome, razao_social, cpf_cnpj, revenda_id, limite_usuarios } = (body ?? {}) as Record<string, unknown>;

  try {
    if (typeof nome !== "string" || nome.trim() === "") {
      throw new SyncValidationError("nome é obrigatório");
    }
    if (typeof razao_social !== "string" || razao_social.trim() === "") {
      throw new SyncValidationError("razao_social é obrigatório");
    }
    if (typeof cpf_cnpj !== "string" || onlyDigits(cpf_cnpj) === "") {
      throw new SyncValidationError("cpf_cnpj é obrigatório");
    }
    if (revenda_id !== undefined && revenda_id !== null && typeof revenda_id !== "string") {
      throw new SyncValidationError("revenda_id inválido");
    }
    if (
      limite_usuarios !== undefined &&
      limite_usuarios !== null &&
      (typeof limite_usuarios !== "number" || !Number.isInteger(limite_usuarios) || limite_usuarios < 0)
    ) {
      throw new SyncValidationError("limite_usuarios deve ser um número inteiro maior ou igual a 0");
    }

    // Credencial do Usuário Master é sempre gerada aqui — o Parceiro nunca digita
    // a senha do cliente. Mostrada em texto puro só nesta resposta; o Master
    // pode mantê-la ou trocar no primeiro login (empresas.senha_temporaria).
    const senha = gerarSenhaTemporaria();

    // Cadastro feito pelo painel de uma revenda: o cliente fica vinculado a ela.
    // Cadastro feito pelo painel Master (sem revenda_id): cliente fica sem dono.
    if (typeof revenda_id === "string" && revenda_id.trim() !== "") {
      const { rows: revendaRows } = await pool.query(
        `SELECT id FROM core.empresas WHERE id = $1 AND is_admin = true AND ativo = true`,
        [revenda_id]
      );
      if (revendaRows.length === 0) {
        throw new SyncValidationError("Revenda inválida");
      }
    }

    const senhaHash = await hashPassword(senha);
    const revendaIdValor = typeof revenda_id === "string" && revenda_id.trim() !== "" ? revenda_id : null;
    const limiteUsuariosValor = typeof limite_usuarios === "number" ? limite_usuarios : null;

    const { rows } = await pool.query(
      `INSERT INTO core.empresas (nome, razao_social, cpf_cnpj, password, revenda_id, senha_temporaria, limite_usuarios)
       VALUES ($1, $2, $3, $4, $5, true, $6)
       RETURNING id, nome, razao_social, cpf_cnpj, ativo, limite_usuarios, created_at, updated_at`,
      [nome.trim(), razao_social.trim(), onlyDigits(cpf_cnpj), senhaHash, revendaIdValor, limiteUsuariosValor]
    );

    // A senha em texto puro só existe aqui — o banco guarda só o hash. Copie
    // agora e repasse ao cliente; ele poderá mantê-la ou trocá-la no primeiro login.
    return new Response(JSON.stringify({ empresa: rows[0], senha_master: senha }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
