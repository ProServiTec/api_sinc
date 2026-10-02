import { gunzipSync, inflateRawSync } from "zlib";

/**
 * Parser de XML de nota fiscal (NF-e/NFC-e), transposto do legado Python
 * (sqlite-viewer/modules/xml_parser.py) para a nuvem.
 *
 * Diferença em relação ao legado: na nuvem, as colunas de XML são `bytea`
 * cujo conteúdo é uma string **base64**. Ex.:
 *   - pdv.nota_fiscal.xml_enviado_autorizacao  -> base64( XML puro )
 *   - pdv.nota_fiscal_compra.xml_compactado    -> base64( ZIP( XML ) )
 *
 * Então a decodificação é: bytea -> string base64 -> bytes ->
 *   (ZIP "PK" -> inflar) | (gzip 0x1f8b -> gunzip) | XML puro
 * -> remover namespaces -> extrair <det>/<prod>.
 */

export interface FiscalItem {
  /** número do item dentro da nota (atributo nItem de <det>) */
  nItem: string;
  /** código do produto (cProd) */
  cProd: string;
  /** descrição (xProd) */
  xProd: string;
  /** quantidade comercial (qCom) */
  qCom: string;
  /** valor unitário comercial (vUnCom) */
  vUnCom: string;
  /** valor total do produto (vProd) */
  vProd: string;
  /** NCM */
  ncm: string;
  /** CFOP */
  cfop: string;
}

/** Entrada crua: o que a coluna bytea entrega (Buffer via pg) ou já uma string. */
export type XmlBlob = Buffer | Uint8Array | string | null | undefined;

const ENCODINGS: BufferEncoding[] = ["utf-8", "latin1"];

/**
 * Decodifica o blob de XML vindo do banco para texto XML legível.
 * Retorna `null` quando não há conteúdo aproveitável.
 */
export function decodeXmlBlob(blob: XmlBlob): string | null {
  if (blob == null) return null;

  // 1) Normaliza para Buffer de bytes brutos.
  let bytes: Buffer;
  if (typeof blob === "string") {
    bytes = Buffer.from(blob, "utf-8");
  } else {
    bytes = Buffer.from(blob);
  }
  if (bytes.length === 0) return null;

  // 2) Se o conteúdo é uma string base64 (como armazenado no bytea da nuvem),
  //    decodifica para os bytes reais.
  const asAscii = bytes.toString("latin1").trim();
  if (looksLikeBase64(asAscii)) {
    const decoded = Buffer.from(asAscii, "base64");
    if (decoded.length > 0) bytes = decoded;
  }

  // 3) Desembrulha container binário conforme a assinatura.
  const unwrapped = unwrapContainer(bytes);

  // 4) Decodifica os bytes de XML para texto tentando várias codificações.
  return decodeBytesToText(unwrapped);
}

/** ZIP ("PK\x03\x04") ou gzip (0x1f 0x8b) -> XML bruto; senão retorna como está. */
function unwrapContainer(bytes: Buffer): Buffer {
  if (bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    // ZIP: PK\x03\x04
    const inner = unzipFirstEntry(bytes);
    if (inner) return inner;
  }
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    // gzip
    try {
      return gunzipSync(bytes);
    } catch {
      /* cai pro retorno cru */
    }
  }
  return bytes;
}

/**
 * Extrai o primeiro arquivo de um ZIP simples lendo o "local file header",
 * sem dependência externa. Suporta stored (0) e deflate (8).
 */
function unzipFirstEntry(buf: Buffer): Buffer | null {
  try {
    // Local file header:
    // 0..3 sig | 4..5 ver | 6..7 flags | 8..9 method | 10..13 time/date
    // 14..17 crc | 18..21 compSize | 22..25 uncompSize | 26..27 nameLen | 28..29 extraLen
    if (buf.readUInt32LE(0) !== 0x04034b50) return null;
    const method = buf.readUInt16LE(8);
    const compSize = buf.readUInt32LE(18);
    const nameLen = buf.readUInt16LE(26);
    const extraLen = buf.readUInt16LE(28);
    const dataStart = 30 + nameLen + extraLen;

    if (method === 0) {
      const size = buf.readUInt32LE(22) || compSize;
      return buf.subarray(dataStart, dataStart + size);
    }
    if (method === 8) {
      // Quando compSize é conhecido, corta exatamente; senão, infla o resto
      // (inflateRaw para no fim do stream e ignora o restante, ex.: central dir).
      const end = compSize > 0 ? dataStart + compSize : buf.length;
      return inflateRawSync(buf.subarray(dataStart, end));
    }
    return null;
  } catch {
    return null;
  }
}

function decodeBytesToText(bytes: Buffer): string | null {
  for (const enc of ENCODINGS) {
    try {
      const text = bytes.toString(enc);
      if (text && text.includes("<")) return text;
    } catch {
      continue;
    }
  }
  const fallback = bytes.toString("latin1");
  return fallback && fallback.includes("<") ? fallback : null;
}

/** Heurística: a string parece base64 (alfabeto e tamanho múltiplo de 4). */
function looksLikeBase64(s: string): boolean {
  if (s.length < 8 || s.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/]+={0,2}$/.test(s);
}

/**
 * Extrai os itens (<det>/<prod>) de um texto XML de nota fiscal.
 * Abordagem por regex (sem dependência de parser XML), espelhando o
 * fallback do legado — robusto para o layout NFe/NFC-e.
 */
export function extractItemsFromXml(xmlText: string | null): FiscalItem[] {
  if (!xmlText) return [];

  // Remove namespaces default (xmlns="...") para simplificar as tags.
  const clean = xmlText.replace(/xmlns="[^"]+"/g, "");

  const itens: FiscalItem[] = [];
  const detRegex = /<det\b([^>]*)>([\s\S]*?)<\/det>/g;
  let m: RegExpExecArray | null;
  while ((m = detRegex.exec(clean)) !== null) {
    const attrs = m[1] ?? "";
    const body = m[2] ?? "";
    const nItem = /nItem="([^"]+)"/.exec(attrs)?.[1] ?? "";

    const item: FiscalItem = {
      nItem,
      cProd: tag(body, "cProd"),
      xProd: tag(body, "xProd"),
      qCom: tag(body, "qCom"),
      vUnCom: tag(body, "vUnCom"),
      vProd: tag(body, "vProd"),
      ncm: tag(body, "NCM"),
      cfop: tag(body, "CFOP"),
    };

    // Só adiciona se tiver ao menos um campo preenchido (igual ao legado).
    if (Object.values(item).some((v) => v !== "")) itens.push(item);
  }
  return itens;
}

function tag(body: string, name: string): string {
  const re = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`);
  return re.exec(body)?.[1]?.trim() ?? "";
}

/** Conveniência: decodifica o blob e já extrai os itens. */
export function parseItemsFromBlob(blob: XmlBlob): FiscalItem[] {
  return extractItemsFromXml(decodeXmlBlob(blob));
}

/** Modelo fiscal -> tipo legível (55 = NF-e, 65 = NFC-e). */
export function tipoNotaPorModelo(modelo: number | string | null | undefined): string {
  const m = String(modelo ?? "").trim();
  if (m === "55") return "NF-e";
  if (m === "65") return "NFC-e";
  return m ? `Modelo ${m}` : "Desconhecido";
}
