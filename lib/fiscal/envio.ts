import { pool } from "@/lib/db";
import { SyncValidationError } from "@/lib/errors";
import { gerarPacoteMensal } from "./pacote";
import { enviarEmailComAnexo } from "./email";

/**
 * Envio do pacote fiscal mensal ao contador. Usado tanto pelo botão do painel
 * quanto pelo cron. Registra o resultado em core.fiscal_envio.
 */

export interface ResultadoEnvio {
  status: "enviado";
  destino: string;
  totalXmls: number;
  competencia: string;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function rotulo(competencia: string): string {
  const [ano, mes] = competencia.split("-").map(Number);
  return `${MESES[(mes || 1) - 1]}/${ano}`;
}

export async function enviarPacoteContador(
  empresaId: string,
  competencia: string
): Promise<ResultadoEnvio> {
  const { rows: cfgRows } = await pool.query<{ contador_email: string | null; contador_nome: string | null }>(
    `SELECT contador_email, contador_nome FROM core.fiscal_config WHERE empresa_id = $1`,
    [empresaId]
  );
  const email = cfgRows[0]?.contador_email?.trim();
  if (!email) {
    throw new SyncValidationError("E-mail do contador não configurado para esta empresa.");
  }

  const { rows: empRows } = await pool.query<{ nome: string }>(
    `SELECT nome FROM core.empresas WHERE id = $1`,
    [empresaId]
  );
  const empresaNome = empRows[0]?.nome ?? "Empresa";

  const pacote = await gerarPacoteMensal(empresaId, competencia);
  if (pacote.totalXmls === 0) {
    throw new SyncValidationError(
      `Nenhuma nota fiscal em ${rotulo(competencia)} para enviar.`
    );
  }

  const competenciaData = `${competencia}-01`;

  try {
    await enviarEmailComAnexo({
      to: email,
      subject: `XMLs fiscais ${rotulo(competencia)} — ${empresaNome}`,
      text:
        `Segue em anexo o pacote de XMLs fiscais de ${rotulo(competencia)} de ${empresaNome}.\n\n` +
        `Total: ${pacote.totalXmls} nota(s) — ${pacote.saida} de saída e ${pacote.entrada} de entrada.\n\n` +
        `Enviado automaticamente pela plataforma Zaya.`,
      attachments: [
        { filename: pacote.nomeArquivo, content: pacote.buffer, contentType: "application/zip" },
      ],
    });

    await pool.query(
      `INSERT INTO core.fiscal_envio (empresa_id, competencia, destino, total_xmls, status)
       VALUES ($1, $2::date, $3, $4, 'enviado')
       ON CONFLICT (empresa_id, competencia) WHERE status = 'enviado'
       DO UPDATE SET enviado_em = now(), destino = EXCLUDED.destino, total_xmls = EXCLUDED.total_xmls`,
      [empresaId, competenciaData, email, pacote.totalXmls]
    );

    return { status: "enviado", destino: email, totalXmls: pacote.totalXmls, competencia };
  } catch (e) {
    const detalhe = e instanceof Error ? e.message : "erro desconhecido";
    await pool.query(
      `INSERT INTO core.fiscal_envio (empresa_id, competencia, destino, total_xmls, status, detalhe)
       VALUES ($1, $2::date, $3, $4, 'erro', $5)`,
      [empresaId, competenciaData, email, pacote.totalXmls, detalhe]
    );
    throw e;
  }
}

/** Já existe um envio bem-sucedido dessa competência? */
export async function jaEnviado(empresaId: string, competencia: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM core.fiscal_envio
     WHERE empresa_id = $1 AND competencia = $2::date AND status = 'enviado' LIMIT 1`,
    [empresaId, `${competencia}-01`]
  );
  return rows.length > 0;
}
