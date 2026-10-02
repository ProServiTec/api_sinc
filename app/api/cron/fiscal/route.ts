import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { competenciaMesAnterior, ingestCompetencia } from "@/lib/fiscal/ingest";
import { enviarPacoteContador, jaEnviado } from "@/lib/fiscal/envio";
import { purgarEnviadosAntigos } from "@/lib/fiscal/purga";

/**
 * Envio automático do pacote fiscal ao contador, disparado por um cron na VPS
 * nos primeiros dias do mês. Protegido por segredo (CRON_SECRET).
 *
 *   curl -X POST https://.../api/cron/fiscal -H "Authorization: Bearer $CRON_SECRET"
 *
 * Envia a competência do mês anterior para cada empresa com envio_automatico
 * cujo dia_envio já chegou e que ainda não recebeu o envio. Idempotente.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: "CRON_SECRET não configurado" }, 503);
  }
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${secret}`) {
    return json({ error: "Não autorizado" }, 401);
  }

  const competencia = competenciaMesAnterior();
  const diaHoje = new Date().getUTCDate();

  const { rows: alvos } = await pool.query<{ empresa_id: string }>(
    `SELECT empresa_id FROM core.fiscal_config
     WHERE envio_automatico = true
       AND contador_email IS NOT NULL
       AND dia_envio <= $1`,
    [diaHoje]
  );

  const resultados: Array<{ empresa_id: string; status: string; detalhe?: string }> = [];
  let enviados = 0;
  let pulados = 0;
  let erros = 0;

  for (const alvo of alvos) {
    try {
      if (await jaEnviado(alvo.empresa_id, competencia)) {
        pulados++;
        resultados.push({ empresa_id: alvo.empresa_id, status: "ja_enviado" });
        continue;
      }
      // Garante os dados estruturados atualizados antes do envio (idempotente).
      await ingestCompetencia(alvo.empresa_id, competencia);
      const r = await enviarPacoteContador(alvo.empresa_id, competencia);
      enviados++;
      resultados.push({ empresa_id: alvo.empresa_id, status: r.status });
    } catch (e) {
      erros++;
      resultados.push({
        empresa_id: alvo.empresa_id,
        status: "erro",
        detalhe: e instanceof Error ? e.message : "erro",
      });
    }
  }

  // Purga do XML bruto de competências já enviadas há mais que a carência.
  let purga = null;
  try {
    purga = await purgarEnviadosAntigos();
  } catch (e) {
    purga = { erro: e instanceof Error ? e.message : "erro na purga" };
  }

  return json({ competencia, diaHoje, total: alvos.length, enviados, pulados, erros, resultados, purga });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
