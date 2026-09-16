import { pool } from "@/lib/db";
import { classifyError } from "@/lib/errors";

/**
 * Catálogo de planos de licença disponíveis pra compra. Usado pelo seletor de
 * "Nova Licença" na tela de detalhe do cliente (a compra em si já atribui a
 * licença direto ao cliente — não existe mais um estoque intermediário por revenda).
 */
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, descricao, valor, periodicidade, dia_fechamento
       FROM core.licencas
       WHERE ativo = true
       ORDER BY nome`
    );

    return new Response(JSON.stringify({ catalogo: rows }), {
      status: 200,
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
