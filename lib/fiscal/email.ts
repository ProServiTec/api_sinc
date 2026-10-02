import nodemailer from "nodemailer";
import { SyncValidationError } from "@/lib/errors";

/**
 * Envio de e-mail do módulo fiscal (pacote mensal ao contador).
 * A configuração SMTP vem de variáveis de ambiente — enquanto não estiverem
 * definidas, o envio fica inativo e falha com mensagem clara.
 *
 *   FISCAL_SMTP_HOST, FISCAL_SMTP_PORT, FISCAL_SMTP_SECURE (true/false),
 *   FISCAL_SMTP_USER, FISCAL_SMTP_PASS, FISCAL_SMTP_FROM
 */

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export function lerSmtpConfig(): SmtpConfig | null {
  const host = process.env.FISCAL_SMTP_HOST;
  const user = process.env.FISCAL_SMTP_USER;
  const pass = process.env.FISCAL_SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.FISCAL_SMTP_PORT || "465");
  const secure = (process.env.FISCAL_SMTP_SECURE || (port === 465 ? "true" : "false")) === "true";
  const from = process.env.FISCAL_SMTP_FROM || user;
  return { host, port, secure, user, pass, from };
}

export function smtpConfigurado(): boolean {
  return lerSmtpConfig() !== null;
}

export interface Anexo {
  filename: string;
  content: Buffer;
  contentType?: string;
}

export async function enviarEmailComAnexo(opts: {
  to: string;
  subject: string;
  text: string;
  attachments?: Anexo[];
}): Promise<void> {
  const cfg = lerSmtpConfig();
  if (!cfg) {
    throw new SyncValidationError(
      "Envio de e-mail não configurado. Defina FISCAL_SMTP_HOST/USER/PASS no ambiente."
    );
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  await transporter.sendMail({
    from: cfg.from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    attachments: opts.attachments,
  });
}
