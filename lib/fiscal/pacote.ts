import { crc32, deflateRawSync } from "zlib";
import { pool } from "@/lib/db";
import { decodeXmlBlob } from "./xmlParser";

/**
 * Geração do pacote fiscal mensal: junta todos os XMLs de entrada + saída de
 * uma competência num único ZIP (para enviar ao contador). Sem dependência
 * externa — o ZIP é montado à mão com deflate (zlib nativo).
 */

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** Monta um arquivo ZIP (método deflate) a partir das entradas. */
export function criarZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf-8");
    const crc = crc32(entry.data) >>> 0;
    const compressed = deflateRawSync(entry.data);
    const uncompSize = entry.data.length;
    const compSize = compressed.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // sig
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: bit 11 = nomes em UTF-8
    local.writeUInt16LE(8, 8); // method: deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compSize, 18);
    local.writeUInt32LE(uncompSize, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra len
    locals.push(local, nameBuf, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // sig
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // flags
    central.writeUInt16LE(8, 10); // method
    central.writeUInt16LE(0, 12); // mod time
    central.writeUInt16LE(0x21, 14); // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compSize, 20);
    central.writeUInt32LE(uncompSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra len
    central.writeUInt16LE(0, 32); // comment len
    central.writeUInt16LE(0, 34); // disk start
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42); // local header offset
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + compressed.length;
  }

  const localPart = Buffer.concat(locals);
  const centralPart = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // sig
  end.writeUInt16LE(0, 4); // disk
  end.writeUInt16LE(0, 6); // disk with cd
  end.writeUInt16LE(entries.length, 8); // entries this disk
  end.writeUInt16LE(entries.length, 10); // total entries
  end.writeUInt32LE(centralPart.length, 12); // cd size
  end.writeUInt32LE(localPart.length, 16); // cd offset
  end.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([localPart, centralPart, end]);
}

export interface PacoteMensal {
  buffer: Buffer;
  nomeArquivo: string;
  totalXmls: number;
  saida: number;
  entrada: number;
}

/**
 * Monta o XML autorizado padrão (procNFe) da saída juntando a NFe (do envelope
 * de envio) com o protocolo (protNFe, do retorno da autorização). Se faltar o
 * protocolo, cai para a NFe/envelope disponível.
 */
export function montarNfeProc(enviado: string | null, retorno: string | null): string | null {
  const nfe = enviado ? /<NFe\b[\s\S]*?<\/NFe>/.exec(enviado)?.[0] ?? null : null;
  const prot = retorno ? /<protNFe\b[\s\S]*?<\/protNFe>/.exec(retorno)?.[0] ?? null : null;

  if (nfe && prot) {
    return (
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">${nfe}${prot}</nfeProc>`
    );
  }
  // Sem protocolo: devolve a NFe (se extraída) ou o XML enviado como está.
  return nfe ?? enviado ?? null;
}

/**
 * Gera o pacote ZIP com os XMLs de entrada + saída de uma competência (mês).
 * `competencia` = 'YYYY-MM'. Saída = procNFe montado (autorizado); entrada =
 * xml_compactado (já é nfeProc).
 */
export async function gerarPacoteMensal(
  empresaId: string,
  competencia: string
): Promise<PacoteMensal> {
  const [ano, mes] = competencia.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, mes, 1)).toISOString().slice(0, 10);

  const entries: ZipEntry[] = [];

  // Saída: monta o procNFe (NFe do enviado + protNFe do retornado).
  const { rows: saidaRows } = await pool.query<{
    chave: string | null;
    numero: string | null;
    xml_env: Buffer | null;
    xml_ret: Buffer | null;
  }>(
    `SELECT chave_acesso AS chave, numero,
            xml_enviado_autorizacao AS xml_env,
            xml_retornado_autorizacao AS xml_ret
     FROM pdv.nota_fiscal
     WHERE _zaya_empresa_id = $1
       AND xml_enviado_autorizacao IS NOT NULL
       AND data_hora_emissao >= $2 AND data_hora_emissao < $3
       AND data_hora_deletado IS NULL
     ORDER BY numero`,
    [empresaId, inicio, fim]
  );
  let saida = 0;
  for (const row of saidaRows) {
    const xml = montarNfeProc(decodeXmlBlob(row.xml_env), decodeXmlBlob(row.xml_ret));
    if (!xml) continue;
    const base = (row.chave || row.numero || `nota-${entries.length + 1}`).toString();
    entries.push({ name: `saida/${base}.xml`, data: Buffer.from(xml, "utf-8") });
    saida++;
  }

  // Entrada: xml_compactado já é o nfeProc autorizado.
  const { rows: entradaRows } = await pool.query<{
    chave: string | null;
    numero: string | null;
    xml: Buffer;
  }>(
    `SELECT chave_acesso AS chave, numero, xml_compactado AS xml
     FROM pdv.nota_fiscal_compra
     WHERE _zaya_empresa_id = $1
       AND xml_compactado IS NOT NULL
       AND data_hora_emissao >= $2 AND data_hora_emissao < $3
       AND situacao = 3
       AND data_hora_deletado IS NULL
     ORDER BY numero`,
    [empresaId, inicio, fim]
  );
  let entrada = 0;
  for (const row of entradaRows) {
    const xml = decodeXmlBlob(row.xml);
    if (!xml) continue;
    const base = (row.chave || row.numero || `nota-${entries.length + 1}`).toString();
    entries.push({ name: `entrada/${base}.xml`, data: Buffer.from(xml, "utf-8") });
    entrada++;
  }

  const buffer = criarZip(entries);
  return {
    buffer,
    nomeArquivo: `fiscal-${competencia}-${empresaId.slice(0, 8)}.zip`,
    totalXmls: entries.length,
    saida,
    entrada,
  };
}
