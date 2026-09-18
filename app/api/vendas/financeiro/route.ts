import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

/**
 * Contas a pagar/receber (aba "Financeiro"). Assume positiva_negativa = 1
 * como "a receber" e qualquer outro valor como "a pagar" — inferido do nome
 * da coluna, já que pdv.conta_pagar_receber ainda não tem dado real
 * sincronizado por nenhum cliente pra confirmar a convenção.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const empresaId = params.get("empresa_id");
  const filialId = params.get("filial_id") || null;
  const tipo = params.get("tipo") === "pagar" ? "pagar" : "receber";
  const mes = Number(params.get("mes")) || new Date().getUTCMonth() + 1;
  const ano = Number(params.get("ano")) || new Date().getUTCFullYear();
  const buscaCliente = params.get("busca_cliente") || null;
  const dispositivoId = params.get("dispositivo_id") || null;
  const pagina = Math.max(1, Number(params.get("pagina") ?? "1") || 1);
  const porPagina = Math.min(100, Math.max(1, Number(params.get("por_pagina") ?? "25") || 25));

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const inicioMes = new Date(Date.UTC(ano, mes - 1, 1));
    const fimMes = new Date(Date.UTC(ano, mes, 1));

    const p = [empresaId, filialId, inicioMes.toISOString(), fimMes.toISOString(), buscaCliente, dispositivoId];
    let baseQuery = "";

    if (tipo === "pagar") {
      baseQuery = `
        FROM pdv.conta_pagar_receber c
        LEFT JOIN pdv.cliente cl ON cl._zaya_empresa_id = c._zaya_empresa_id AND cl.id_cliente = c.id_cliente
        LEFT JOIN (
          SELECT id_conta_pagar_receber, SUM(valor_liquidado) AS pago
          FROM pdv.recebimento_pagamento
          WHERE _zaya_empresa_id = $1 AND data_hora_deletado IS NULL
          GROUP BY id_conta_pagar_receber
        ) r ON r.id_conta_pagar_receber = c.id_conta_pagar_receber
        WHERE c._zaya_empresa_id = $1
          AND c.positiva_negativa = 0
          AND c.data_hora_deletado IS NULL
          AND ($2::uuid IS NULL OR c._zaya_filial_id = $2)
          AND c.vencimento::timestamp >= $3::timestamp
          AND c.vencimento::timestamp < $4::timestamp
          AND ($5::text IS NULL OR cl.nome ILIKE '%' || $5 || '%')
          AND ($6::text IS NULL OR c._zaya_dispositivo_id::text = $6)
      `;
    } else {
      baseQuery = `
        FROM (
          SELECT 
            c.id_conta_pagar_receber::text AS id_conta_pagar_receber, 
            c.tipo_conta::bigint AS tipo_conta, 
            c.valor::double precision AS valor, 
            c.vencimento::text AS vencimento, 
            c.documento::text AS documento, 
            cl.nome::text AS nome_cliente,
            c._zaya_empresa_id, 
            c._zaya_filial_id, 
            c.data_hora_deletado, 
            c._zaya_dispositivo_id::text AS id_dispositivo
          FROM pdv.conta_pagar_receber c
          LEFT JOIN pdv.cliente cl ON cl._zaya_empresa_id = c._zaya_empresa_id AND cl.id_cliente = c.id_cliente
          WHERE c.positiva_negativa = 1
          
          UNION ALL
          
          SELECT 
            vfp.id_venda_forma_pagamento::text AS id_conta_pagar_receber, 
            4::bigint AS tipo_conta, 
            vfp.valor::double precision AS valor, 
            COALESCE(vfp.vencimento, v.data_hora_criado)::text AS vencimento, 
            ('Venda (Crediário) #' || v.codigo_venda)::text AS documento, 
            v.nome_cliente::text AS nome_cliente,
            vfp._zaya_empresa_id, 
            vfp._zaya_filial_id, 
            vfp.data_hora_deletado, 
            v.id_dispositivo::text AS id_dispositivo
          FROM pdv.venda_forma_pagamento vfp
          JOIN pdv.venda v ON v.id_venda = vfp.id_venda
          WHERE vfp.forma_pagamento = 4 AND v.data_hora_deletado IS NULL
        ) c
        LEFT JOIN (
          SELECT id_conta_pagar_receber::text AS id_conta_pagar_receber, SUM(valor_liquidado) AS pago
          FROM pdv.recebimento_pagamento
          WHERE _zaya_empresa_id = $1 AND data_hora_deletado IS NULL
          GROUP BY id_conta_pagar_receber::text
        ) r ON r.id_conta_pagar_receber = c.id_conta_pagar_receber
        WHERE c._zaya_empresa_id = $1
          AND c.data_hora_deletado IS NULL
          AND ($2::uuid IS NULL OR c._zaya_filial_id = $2)
          AND c.vencimento::timestamp >= $3::timestamp
          AND c.vencimento::timestamp < $4::timestamp
          AND ($5::text IS NULL OR c.nome_cliente ILIKE '%' || $5 || '%')
          AND ($6::text IS NULL OR c.id_dispositivo = $6)
      `;
    }

    let selectPrefix = "";
    if (tipo === "receber") {
      selectPrefix = `SELECT c.id_conta_pagar_receber, c.tipo_conta, c.valor, c.vencimento, c.documento, c.nome_cliente, COALESCE(r.pago, 0) AS valor_pago`;
    } else {
      selectPrefix = `SELECT c.id_conta_pagar_receber, c.tipo_conta, c.valor, c.vencimento, c.documento, cl.nome AS nome_cliente, COALESCE(r.pago, 0) AS valor_pago`;
    }
    const [totalResult, itensResult] = await Promise.all([
      pool.query(`SELECT count(*)::int AS total ${baseQuery}`, p),
      pool.query(
        `${selectPrefix}
         ${baseQuery}
         ORDER BY c.vencimento ASC
         LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
        p
      ),
    ]);

    const agora = new Date();
    let pendente = 0,
      pagoParcial = 0,
      vencidos = 0,
      pagos = 0,
      total = 0;

    for (const c of itensResult.rows) {
      const valor = Number(c.valor);
      const pago = Number(c.valor_pago);
      total += valor;
      if (pago >= valor) {
        pagos += valor;
      } else if (pago > 0) {
        pagoParcial += valor - pago;
      } else if (new Date(c.vencimento) < agora) {
        vencidos += valor - pago;
      } else {
        pendente += valor - pago;
      }
    }

    return new Response(
      JSON.stringify({
        contas: itensResult.rows,
        total: totalResult.rows[0].total,
        pagina,
        por_pagina: porPagina,
        resumo: { pendente, pago_parcial: pagoParcial, vencidos, pagos, total },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { empresa_id, descricao, valor, vencimento, categoria, observacao, pago, repetir_mes } = data;

    if (!empresa_id || !descricao || valor === undefined || !vencimento) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), { status: 400 });
    }

    const qty = repetir_mes ? 12 : 1;
    let currentVencimento = new Date(vencimento);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (let i = 0; i < qty; i++) {
        const idConta = crypto.randomUUID();
        const dataVenc = new Date(currentVencimento);
        
        await client.query(
          `INSERT INTO pdv.conta_pagar_receber 
            (_zaya_empresa_id, id_conta_pagar_receber, documento, valor, vencimento, positiva_negativa, tipo_conta, data_hora_criado)
           VALUES ($1, $2, $3, $4, $5, 0, 1, NOW())`,
          [empresa_id, idConta, descricao + (qty > 1 ? ` (${i + 1}/${qty})` : ""), valor, dataVenc.toISOString(), ]
        );

        if (pago) {
          const idRecebimento = crypto.randomUUID();
          await client.query(
            `INSERT INTO pdv.recebimento_pagamento 
              (_zaya_empresa_id, id_recebimento_pagamento, id_conta_pagar_receber, valor, valor_liquido, valor_liquidado, data_liquidacao, data_hora_criado)
             VALUES ($1, $2, $3, $4, $4, $4, NOW(), NOW())`,
            [empresa_id, idRecebimento, idConta, valor]
          );
        }

        currentVencimento.setUTCMonth(currentVencimento.getUTCMonth() + 1);
      }

      await client.query("COMMIT");
      return new Response(JSON.stringify({ success: true }), { status: 201 });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}
