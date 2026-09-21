import { NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { classifyError, SyncValidationError } from "@/lib/errors";

/** Formata uma Date como timestamp "ingênuo" (sem timezone), no mesmo formato
 * usado pelas colunas de texto sincronizadas do PDV (data_hora_criado etc). */
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

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const empresaId = params.get("empresa_id");
  const filialId = params.get("filial_id") || null;
  const periodo = params.get("periodo") ?? "caixa_atual";
  const dispositivo = params.get("dispositivo") || null;
  const deParam = params.get("de");
  const ateParam = params.get("ate");

  try {
    if (!empresaId) {
      throw new SyncValidationError("empresa_id é obrigatório");
    }

    const { rows: empresaRows } = await pool.query(
      `SELECT id, nome FROM core.empresas WHERE id = $1 AND ativo = true`,
      [empresaId]
    );

    if (empresaRows.length === 0) {
      return new Response(JSON.stringify({ error: "Empresa não encontrada" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Caixas em aberto (independem do período selecionado)
    const { rows: caixasAbertos } = await pool.query(
      `SELECT fc.id_dispositivo,
              fc.data_abertura,
              (SELECT MAX(v.codigo_dispositivo) FROM pdv.venda v
                WHERE v._zaya_empresa_id = fc._zaya_empresa_id AND v.id_dispositivo = fc.id_dispositivo) AS codigo_dispositivo
       FROM pdv.fechamento_caixa fc
       WHERE fc._zaya_empresa_id = $1
         AND ($2::uuid IS NULL OR fc._zaya_filial_id = $2)
         AND fc.data_fechamento IS NULL
       ORDER BY fc.data_abertura ASC`,
      [empresaId, filialId]
    );

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
      // caixa_atual: desde a abertura do caixa em aberto mais antigo, ou desde o início de hoje
      de = caixasAbertos.length > 0 ? new Date(caixasAbertos[0].data_abertura) : inicioDoDia(agora);
    }

    const bucket = periodo === "1a" ? "month" : "day";
    const filtro = `AND ($4::text IS NULL OR v.id_dispositivo = $4) AND ($5::uuid IS NULL OR v._zaya_filial_id = $5)`;
    const p = [empresaId, naive(de), naive(ate), dispositivo, filialId];

    // Janela anterior de mesma duração, usada para calcular o crescimento percentual.
    const duracaoMs = ate.getTime() - de.getTime();
    const ateAnterior = new Date(de.getTime() - 1);
    const deAnterior = new Date(ateAnterior.getTime() - duracaoMs);
    const pAnterior = [empresaId, naive(deAnterior), naive(ateAnterior), dispositivo, filialId];

    const [
      resumoResult,
      itensResult,
      topProdutosResult,
      porDiaResult,
      dispositivosResult,
      ultimaSyncResult,
      resumoAnteriorResult,
      receitaPorDispositivoResult,
      categoriasResult,
      formasPagamentoResult,
      horarioPicoResult,
      operadoresResult,
      tipoVendasResult
    ] = await Promise.all([
        pool.query(
          `SELECT count(*)::int AS total_vendas, COALESCE(SUM(v.valor_total_liquido), 0) AS receita_total
           FROM pdv.venda v
           WHERE v._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}`,
          p
        ),
        pool.query(
          `SELECT COALESCE(SUM(vi.valor_total_liquido), 0) AS receita_itens,
                  COALESCE(SUM(vi.preco_custo_unitario * vi.qtd), 0) AS custo_itens
           FROM pdv.venda_item vi
           JOIN pdv.venda v ON v.id_venda = vi.id_venda AND v._zaya_empresa_id = vi._zaya_empresa_id
           WHERE vi._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND vi.cancelado = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}`,
          p
        ),
        pool.query(
          `SELECT p.descricao, SUM(vi.valor_total_liquido) AS total
           FROM pdv.venda_item vi
           JOIN pdv.venda v ON v.id_venda = vi.id_venda AND v._zaya_empresa_id = vi._zaya_empresa_id
           LEFT JOIN pdv.produto p ON p.id_produto = vi.id_produto AND p._zaya_empresa_id = vi._zaya_empresa_id
           WHERE vi._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND vi.cancelado = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}
           GROUP BY p.descricao
           ORDER BY total DESC
           LIMIT 5`,
          p
        ),
        pool.query(
          `SELECT to_char(date_trunc($6, v.data_hora_criado::timestamp), 'YYYY-MM-DD') AS dia,
                  count(*)::int AS vendas,
                  COALESCE(SUM(v.valor_total_liquido), 0) AS total
           FROM pdv.venda v
           WHERE v._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}
           GROUP BY 1
           ORDER BY 1 ASC`,
          [...p, bucket]
        ),
        pool.query(
          `SELECT id_dispositivo, MAX(codigo_dispositivo) AS codigo_dispositivo
           FROM pdv.venda
           WHERE _zaya_empresa_id = $1
             AND ($2::uuid IS NULL OR _zaya_filial_id = $2)
           GROUP BY id_dispositivo
           ORDER BY 1`,
          [empresaId, filialId]
        ),
        pool.query(
          `SELECT codigo_dispositivo, _zaya_synced_at
           FROM pdv.venda
           WHERE _zaya_empresa_id = $1
             AND ($2::uuid IS NULL OR _zaya_filial_id = $2)
           ORDER BY _zaya_synced_at DESC
           LIMIT 1`,
          [empresaId, filialId]
        ),
        pool.query(
          `SELECT count(*)::int AS total_vendas, COALESCE(SUM(v.valor_total_liquido), 0) AS receita_total
           FROM pdv.venda v
           WHERE v._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}`,
          pAnterior
        ),
        pool.query(
          `SELECT v.id_dispositivo,
                  MAX(v.codigo_dispositivo) AS codigo_dispositivo,
                  count(*)::int AS vendas,
                  COALESCE(SUM(v.valor_total_liquido), 0) AS total
           FROM pdv.venda v
           WHERE v._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}
           GROUP BY v.id_dispositivo
           ORDER BY total DESC`,
          p
        ),
        pool.query(
          `SELECT COALESCE(g.descricao, 'Sem Categoria') AS categoria, SUM(vi.valor_total_liquido) AS total
           FROM pdv.venda_item vi
           JOIN pdv.venda v ON v.id_venda = vi.id_venda AND v._zaya_empresa_id = vi._zaya_empresa_id
           LEFT JOIN pdv.produto pr ON pr.id_produto = vi.id_produto AND pr._zaya_empresa_id = vi._zaya_empresa_id
           LEFT JOIN pdv.prod_grupo g ON g.id_prod_grupo = pr.id_prod_grupo AND g._zaya_empresa_id = pr._zaya_empresa_id
           WHERE vi._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND vi.cancelado = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}
           GROUP BY categoria
           ORDER BY total DESC
           LIMIT 10`,
          p
        ),
        pool.query(
          `SELECT fp.forma_pagamento, SUM(fp.valor) AS total
           FROM pdv.venda_forma_pagamento fp
           JOIN pdv.venda v ON v.id_venda = fp.id_venda AND v._zaya_empresa_id = fp._zaya_empresa_id
           WHERE fp._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}
           GROUP BY fp.forma_pagamento
           ORDER BY total DESC`,
          p
        ),
        pool.query(
          `SELECT EXTRACT(HOUR FROM v.data_hora_criado::timestamp)::int AS hora,
                  COUNT(*)::int AS vendas,
                  SUM(v.valor_total_liquido) AS total
           FROM pdv.venda v
           WHERE v._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}
           GROUP BY hora
           ORDER BY hora ASC`,
          p
        ),
        pool.query(
          `SELECT COALESCE(o.nome, 'Sem Operador') AS operador,
                  SUM(v.valor_total_liquido) AS total
           FROM pdv.venda v
           LEFT JOIN pdv.operador o ON o.id_operador = v.id_operador AND o._zaya_empresa_id = v._zaya_empresa_id
           WHERE v._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}
           GROUP BY operador
           ORDER BY total DESC`,
          p
        ),
        pool.query(
          `SELECT v.tipo_venda, SUM(v.valor_total_liquido) AS total
           FROM pdv.venda v
           WHERE v._zaya_empresa_id = $1
             AND v.cancelada_pelo_usuario = '0'
             AND v.data_hora_criado::timestamp >= $2::timestamp
             AND v.data_hora_criado::timestamp <= $3::timestamp
             ${filtro}
           GROUP BY v.tipo_venda
           ORDER BY total DESC`,
          p
        ),
      ]);

    const resumo = resumoResult.rows[0];
    const itens = itensResult.rows[0];
    const ultimaSync = ultimaSyncResult.rows[0] ?? null;
    const resumoAnterior = resumoAnteriorResult.rows[0];

    const receitaTotalNum = Number(resumo.receita_total);
    const receitaItensNum = Number(itens.receita_itens);
    const margemBrutaNum = receitaItensNum - Number(itens.custo_itens);

    function crescimentoPct(atual: number, anterior: number): number | null {
      if (anterior <= 0) return null;
      return ((atual - anterior) / anterior) * 100;
    }

    const topProdutos = topProdutosResult.rows.map((tp) => ({
      descricao: tp.descricao ?? "Produto sem nome",
      valor: tp.total,
      percentual: receitaItensNum > 0 ? (Number(tp.total) / receitaItensNum) * 100 : 0,
    }));

    const receitaPorDispositivo = receitaPorDispositivoResult.rows.map((d) => ({
      id_dispositivo: d.id_dispositivo,
      label: d.codigo_dispositivo ? `Dispositivo ${d.codigo_dispositivo}` : d.id_dispositivo.slice(0, 8),
      vendas: d.vendas,
      total: d.total,
      percentual: receitaTotalNum > 0 ? (Number(d.total) / receitaTotalNum) * 100 : 0,
    }));

    return new Response(
      JSON.stringify({
        empresa: empresaRows[0],
        periodo: { de: de.toISOString(), ate: ate.toISOString(), preset: periodo, bucket },
        resumo: {
          receita_total: resumo.receita_total,
          total_vendas: resumo.total_vendas,
          margem_bruta: margemBrutaNum,
          margem_percentual: receitaTotalNum > 0 ? (margemBrutaNum / receitaTotalNum) * 100 : null,
          top_produto: topProdutos[0] ?? null,
          crescimento_receita_pct: crescimentoPct(receitaTotalNum, Number(resumoAnterior.receita_total)),
          crescimento_vendas_pct: crescimentoPct(Number(resumo.total_vendas), Number(resumoAnterior.total_vendas)),
        },
        top_produtos: topProdutos,
        receita_por_dispositivo: receitaPorDispositivo,
        vendas_por_dia: porDiaResult.rows,
        caixas_abertos: caixasAbertos.map((c) => ({
          id_dispositivo: c.id_dispositivo,
          label: c.codigo_dispositivo ? `Dispositivo ${c.codigo_dispositivo}` : c.id_dispositivo.slice(0, 8),
          horas_aberto: Math.max(
            0,
            Math.round((agora.getTime() - new Date(c.data_abertura).getTime()) / 3_600_000)
          ),
        })),
        dispositivos: dispositivosResult.rows.map((d) => ({
          id_dispositivo: d.id_dispositivo,
          label: d.codigo_dispositivo ? `Dispositivo ${d.codigo_dispositivo}` : d.id_dispositivo.slice(0, 8),
        })),
        categorias: categoriasResult.rows,
        formas_pagamento: formasPagamentoResult.rows,
        horario_pico: horarioPicoResult.rows,
        operadores: operadoresResult.rows,
        tipo_vendas: tipoVendasResult.rows,
        ultima_sincronizacao: ultimaSync
          ? {
              label: ultimaSync.codigo_dispositivo ? `Dispositivo ${ultimaSync.codigo_dispositivo}` : "Dispositivo",
              quando: ultimaSync._zaya_synced_at,
            }
          : null,
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
