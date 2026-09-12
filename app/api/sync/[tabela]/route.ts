import { NextRequest } from "next/server";
import { listRecords, upsertRecords } from "@/lib/syncTables";
import { classifyError, SyncValidationError } from "@/lib/errors";
import { autenticarApiClient } from "@/lib/apiClients";

function respostaNaoAutenticado() {
  return new Response(
    JSON.stringify({
      status: 401,
      tipo: "nao_autenticado",
      error: "Token de sincronização ausente ou inválido. Ative a licença em /api/sync/licencas/ativar.",
    }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tabela: string }> }
) {
  const { tabela } = await params;

  const apiClient = await autenticarApiClient(request);
  if (!apiClient) return respostaNaoAutenticado();

  const limitParam = request.nextUrl.searchParams.get("limit");
  const limit = Math.min(Math.max(Number(limitParam) || 200, 1), 1000);

  try {
    const rows = await listRecords(tabela, limit, apiClient.empresaId, apiClient.filialId);
    console.log(`[sync] GET ${tabela} -> 200 (${rows.length} linhas)`);
    return new Response(JSON.stringify({ tabela, data: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const classified = classifyError(error);
    console.error(`[sync] GET ${tabela} -> ${classified.status} (${classified.tipo}): ${classified.error}`);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ tabela: string }> }
) {
  const { tabela } = await params;

  // Instalações de antes do sistema de token continuam mandando sync sem
  // header nenhum: nesse caso caímos no modo de compatibilidade (o registro
  // precisa trazer ele mesmo _zaya_empresa_id, como sempre foi). Só exigimos
  // o token de quem já foi ativado por código de licença e por isso já tem
  // um token pra mandar.
  let identidade = null as Awaited<ReturnType<typeof autenticarApiClient>>;
  if (request.headers.get("authorization")) {
    identidade = await autenticarApiClient(request);
    if (!identidade) return respostaNaoAutenticado();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    console.error(`[sync] POST ${tabela} -> 400 (validacao): Invalid JSON body`);
    const classified = classifyError(new SyncValidationError("Invalid JSON body"));
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const registros = Array.isArray(body)
    ? body
    : Array.isArray((body as { registros?: unknown[] })?.registros)
      ? (body as { registros: unknown[] }).registros
      : null;

  if (!registros) {
    console.error(`[sync] POST ${tabela} -> 400 (validacao): body não é array nem { registros: [...] }`);
    const classified = classifyError(
      new SyncValidationError("Body deve ser um array de registros ou { registros: [...] }")
    );
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  console.log(`[sync] POST ${tabela} <- ${registros.length} registro(s)`);
  if (registros.length > 0) {
    console.log(`[sync]   campos do 1º registro: ${Object.keys(registros[0] as object).join(", ")}`);
  }

  try {
    const result = await upsertRecords(
      tabela,
      registros as Record<string, unknown>[],
      identidade ? { empresaId: identidade.empresaId, filialId: identidade.filialId } : null
    );
    console.log(`[sync] POST ${tabela} -> 200 (upserted: ${result.upserted})`);
    return new Response(JSON.stringify({ ok: true, tabela, ...result }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const classified = classifyError(error);
    console.error(
      `[sync] POST ${tabela} -> ${classified.status} (${classified.tipo}): ${classified.error}` +
        (classified.constraint ? ` [constraint: ${classified.constraint}]` : "") +
        (classified.detalhe_postgres ? ` [detalhe: ${classified.detalhe_postgres}]` : "")
    );
    return new Response(JSON.stringify({ tabela, ...classified }), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
