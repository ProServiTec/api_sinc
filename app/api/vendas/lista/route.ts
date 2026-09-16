import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

function naive(date: Date): string {
  return date.toISOString().replace("Z", "");
}

function inicioDoDia(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function subDias(date: Date, dias: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - dias);
  return d;
}

/** Lista de vendas individuais (aba "Vendas"), com paginação e os mesmos
 * filtros de período/filial/dispositivo do dashboard. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const empresaId = params.get("empresa_id");
  const filialId = params.get("filial_id") || null;
  const periodo = params.get("periodo") ?? "caixa_atual";
  const dispositivo = params.get("dispositivo") || null;
  const deParam = params.get("de");
  const ateParam = params.get("ate");
  const pagina = Math.max(1, Number(params.get("pagina") ?? "1") || 1);
  const porPagina = Math.min(100, Math.max(1, Number(params.get("por_pagina") ?? "25") || 25));

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const agora = new Date();
    let de: Date;
    const ate: Date = periodo === "custom" && ateParam ? new Date(`${ateParam}T23:59:59.999Z`) : agora;

    if (periodo === "custom" && deParam) {
      de = new Date(`${deParam}T00:00:00.000Z`);
    } else if (periodo === "7d") {
      de = subDias(agora, 7);
    } else if (periodo === "30d") {
      de = subDias(agora, 30);
    } else if (periodo === "90d") {
      de = subDias(agora, 90);
    } else if (periodo === "1a") {
      de = subDias(agora, 365);
    } else {
      de = inicioDoDia(agora);
    }

    const p = [empresaId, naive(de), naive(ate), dispositivo, filialId];
    const filtro = `AND ($4::text IS NULL OR v.id_dispositivo = $4) AND ($5::uuid IS NULL OR v._zaya_filial_id = $5)`;

    const [totalResult, itensResult] = await Promise.all([
      pool.query(
        `SELECT count(*)::int AS total
         FROM pdv.venda v
         WHERE v._zaya_empresa_id = $1
           AND v.data_hora_criado::timestamp >= $2::timestamp
           AND v.data_hora_criado::timestamp <= $3::timestamp
           ${filtro}`,
        p
      ),
      pool.query(
        `SELECT v.id_venda, v.codigo_venda, v.data_hora_criado, v.nome_cliente, v.valor_total,
                v.cancelada_pelo_usuario, v.id_dispositivo, v.codigo_dispositivo,
                (SELECT count(*)::int FROM pdv.venda_item vi
                  WHERE vi._zaya_empresa_id = v._zaya_empresa_id AND vi.id_venda = v.id_venda
                    AND vi.cancelado = '0') AS qtd_itens
         FROM pdv.venda v
         WHERE v._zaya_empresa_id = $1
           AND v.data_hora_criado::timestamp >= $2::timestamp
           AND v.data_hora_criado::timestamp <= $3::timestamp
           ${filtro}
         ORDER BY v.data_hora_criado DESC
         LIMIT ${porPagina} OFFSET ${(pagina - 1) * porPagina}`,
        p
      ),
    ]);

    return new Response(
      JSON.stringify({
        vendas: itensResult.rows,
        total: totalResult.rows[0].total,
        pagina,
        por_pagina: porPagina,
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
