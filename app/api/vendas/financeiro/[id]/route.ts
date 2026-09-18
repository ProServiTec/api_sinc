import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError } from "@/lib/errors";

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Soft delete na conta_pagar_receber e recebimento_pagamento
    await pool.query(
      `UPDATE pdv.conta_pagar_receber SET data_hora_deletado = NOW() WHERE id_conta_pagar_receber = $1`,
      [id]
    );
    await pool.query(
      `UPDATE pdv.recebimento_pagamento SET data_hora_deletado = NOW() WHERE id_conta_pagar_receber = $1`,
      [id]
    );

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === "pagar") {
      const empresa_id = body.empresa_id;
      const valor = body.valor;
      
      const idRecebimento = crypto.randomUUID();
      await pool.query(
        `INSERT INTO pdv.recebimento_pagamento 
          (_zaya_empresa_id, id_recebimento_pagamento, id_conta_pagar_receber, valor, valor_liquido, valor_liquidado, data_liquidacao, data_hora_criado)
         VALUES ($1, $2, $3, $4, $4, $4, NOW(), NOW())`,
        [empresa_id, idRecebimento, id, valor]
      );
      
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400 });
  } catch (error) {
    const classified = classifyError(error);
    return new Response(JSON.stringify(classified), {
      status: classified.status,
      headers: { "Content-Type": "application/json" },
    });
  }
}

