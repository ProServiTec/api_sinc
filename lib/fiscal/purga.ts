import { pool } from "@/lib/db";

/**
 * Purga (A5) do XML bruto na nuvem após o envio ao contador + carência.
 *
 * Só descarta XMLs de competências que já foram ENVIADAS com sucesso há mais de
 * `graceDias` dias. Zera as colunas de XML em pdv.* (libera disco) e marca
 * core.fiscal_nota.xml_disponivel = false. Os dados estruturados
 * (core.fiscal_nota / core.fiscal_nota_item) permanecem para os relatórios.
 *
 * Seguro quanto ao re-sync: o coletor C# é incremental por cursor
 * (data_hora_ultima_alteracao > cursor), então uma nota já sincronizada não
 * volta a menos que seja alterada localmente — caso em que reaparece
 * corretamente (e pode ser purgada de novo no ciclo seguinte).
 */

export interface ResultadoPurga {
  competencias: number;
  notasSaida: number;
  notasEntrada: number;
}

export async function purgarEnviadosAntigos(graceDias?: number): Promise<ResultadoPurga> {
  const grace = graceDias ?? Number(process.env.FISCAL_PURGA_GRACE_DIAS || "15");

  const { rows: alvos } = await pool.query<{ id: string; empresa_id: string; comp: string }>(
    `SELECT id, empresa_id, to_char(competencia, 'YYYY-MM') AS comp
     FROM core.fiscal_envio
     WHERE status = 'enviado'
       AND xml_purgado = false
       AND enviado_em < now() - make_interval(days => $1)`,
    [grace]
  );

  let notasSaida = 0;
  let notasEntrada = 0;

  for (const alvo of alvos) {
    const [ano, mes] = alvo.comp.split("-").map(Number);
    const inicio = `${alvo.comp}-01`;
    const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

    const s = await pool.query(
      `UPDATE pdv.nota_fiscal
       SET xml_enviado_autorizacao = NULL, xml_retornado_autorizacao = NULL
       WHERE _zaya_empresa_id = $1
         AND data_hora_emissao >= $2 AND data_hora_emissao < $3
         AND (xml_enviado_autorizacao IS NOT NULL OR xml_retornado_autorizacao IS NOT NULL)`,
      [alvo.empresa_id, inicio, fim]
    );
    notasSaida += s.rowCount ?? 0;

    const e = await pool.query(
      `UPDATE pdv.nota_fiscal_compra
       SET xml_compactado = NULL
       WHERE _zaya_empresa_id = $1
         AND data_hora_emissao >= $2 AND data_hora_emissao < $3
         AND xml_compactado IS NOT NULL`,
      [alvo.empresa_id, inicio, fim]
    );
    notasEntrada += e.rowCount ?? 0;

    await pool.query(
      `UPDATE core.fiscal_nota SET xml_disponivel = false, updated_at = now()
       WHERE empresa_id = $1 AND competencia = $2::date`,
      [alvo.empresa_id, inicio]
    );

    await pool.query(
      `UPDATE core.fiscal_envio SET xml_purgado = true, purgado_em = now() WHERE id = $1`,
      [alvo.id]
    );
  }

  return { competencias: alvos.length, notasSaida, notasEntrada };
}
