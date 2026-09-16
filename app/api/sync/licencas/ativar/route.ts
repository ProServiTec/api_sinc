import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { normalizarCodigoLicenca } from "@/lib/licencaCodigo";
import { gerarTokenApiClient, hashTokenApiClient } from "@/lib/apiClients";
import { travarOuValidarBancoOrigem } from "@/lib/syncTables";

/**
 * Segunda tela do sincronizador: depois do login (POST /api/login) com
 * CNPJ + senha, o instalador pede só o código da licença. Esta rota:
 *  - confirma que o código pertence à empresa que acabou de logar;
 *  - na primeira ativação, cria a filial que essa licença representa e
 *    vincula licencas_atribuidas.filial_id a ela (1 licença = 1 filial);
 *  - em reativações (reinstalar o sincronizador), é idempotente quanto à
 *    filial (devolve sempre a mesma), mas emite um token novo a cada
 *    chamada — cada instalação/computador tem sua própria credencial.
 * O instalador deve gravar o token e enviá-lo como
 * "Authorization: Bearer <token>" em toda chamada a /api/sync/*; o
 * servidor deriva empresa_id/filial_id do token, então o instalador não
 * precisa (e não deve) enviar esses IDs manualmente no payload do sync.
 * O token só é mostrado nesta resposta — o banco guarda só o hash dele.
 */
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

  const { empresa_id, codigo, pdv_source_database } = (body ?? {}) as Record<string, unknown>;

  if (typeof empresa_id !== "string" || empresa_id.trim() === "") {
    const classified = classifyError(new SyncValidationError("empresa_id é obrigatório"));
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (typeof codigo !== "string" || codigo.trim() === "") {
    const classified = classifyError(new SyncValidationError("codigo é obrigatório"));
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const codigoNormalizado = normalizarCodigoLicenca(codigo);
  if (!codigoNormalizado) {
    const classified = classifyError(new SyncValidationError("Código de licença inválido"));
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query(
      `SELECT la.id, la.codigo, la.ativo, la.empresa_id, la.filial_id,
              l.id AS licenca_id, l.nome AS licenca_nome, l.valor, l.periodicidade
       FROM core.licencas_atribuidas la
       JOIN core.licencas l ON l.id = la.licenca_id
       WHERE la.codigo = $1
       FOR UPDATE OF la
       LIMIT 1`,
      [codigoNormalizado]
    );

    const licenca = rows[0];

    if (!licenca || licenca.empresa_id !== empresa_id) {
      await client.query("ROLLBACK");
      return new Response(
        JSON.stringify({ error: "Código de licença inválido ou não pertence a esta empresa" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!licenca.ativo) {
      await client.query("ROLLBACK");
      return new Response(JSON.stringify({ error: "Esta licença está cancelada" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    let filial: { id: string; nome: string };

    if (licenca.filial_id) {
      const { rows: filialRows } = await client.query(
        `SELECT id, nome FROM core.filiais WHERE id = $1`,
        [licenca.filial_id]
      );
      filial = filialRows[0];
    } else {
      const { rows: countRows } = await client.query(
        `SELECT count(*)::int AS total FROM core.filiais WHERE empresa_id = $1`,
        [empresa_id]
      );
      const nomeFilial = `Filial ${countRows[0].total + 1}`;

      const { rows: novaFilialRows } = await client.query(
        `INSERT INTO core.filiais (empresa_id, nome) VALUES ($1, $2) RETURNING id, nome`,
        [empresa_id, nomeFilial]
      );
      filial = novaFilialRows[0];

      await client.query(
        `UPDATE core.licencas_atribuidas SET filial_id = $1, updated_at = now() WHERE id = $2`,
        [filial.id, licenca.id]
      );
    }

    // Trava "1 licença = 1 banco de dados" já na ativação: se essa filial já foi
    // ativada antes por outro PDV+ (id_empresa diferente), avisa agora — sem
    // esperar o primeiro ciclo de sincronização de dados pra descobrir o conflito.
    if (typeof pdv_source_database === "string" && pdv_source_database.trim() !== "") {
      await travarOuValidarBancoOrigem(client, filial.id, pdv_source_database.trim());
    }

    const token = gerarTokenApiClient();
    await client.query(
      `INSERT INTO core.api_clients (empresa_id, filial_id, nome, token_hash)
       VALUES ($1, $2, $3, $4)`,
      [empresa_id, filial.id, `Sincronizador - ${filial.nome}`, hashTokenApiClient(token)]
    );

    await client.query("COMMIT");

    return new Response(
      JSON.stringify({
        empresa_id,
        filial_id: filial.id,
        filial_nome: filial.nome,
        token,
        licenca: {
          id: licenca.id,
          codigo: licenca.codigo,
          licenca_id: licenca.licenca_id,
          licenca_nome: licenca.licenca_nome,
          valor: licenca.valor,
          periodicidade: licenca.periodicidade,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    await client.query("ROLLBACK");
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    client.release();
  }
}
