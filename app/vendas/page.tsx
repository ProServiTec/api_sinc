"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart, DonutChart, LineChart } from "./Charts";
import "./vendas.css";

interface EmpresaSessao {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  is_admin: boolean;
  is_master: boolean;
}

interface CaixaAberto {
  id_dispositivo: string;
  label: string;
  horas_aberto: number;
}

interface Dispositivo {
  id_dispositivo: string;
  label: string;
}

interface TopProduto {
  descricao: string;
  valor: number;
  percentual: number;
}

interface ReceitaDispositivo {
  id_dispositivo: string;
  label: string;
  vendas: number;
  total: number;
  percentual: number;
}

interface Resumo {
  empresa: { id: string; nome: string };
  periodo: { de: string; ate: string; preset: string; bucket: string };
  resumo: {
    receita_total: number;
    total_vendas: number;
    margem_bruta: number;
    margem_percentual: number | null;
    top_produto: TopProduto | null;
    crescimento_receita_pct: number | null;
    crescimento_vendas_pct: number | null;
  };
  top_produtos: TopProduto[];
  receita_por_dispositivo: ReceitaDispositivo[];
  vendas_por_dia: { dia: string; vendas: number; total: number }[];
  caixas_abertos: CaixaAberto[];
  dispositivos: Dispositivo[];
  ultima_sincronizacao: { label: string; quando: string } | null;
}

interface Filtros {
  periodo: "caixa_atual" | "7d" | "30d" | "90d" | "1a" | "custom";
  dispositivo: string;
  de: string;
  ate: string;
}

const PRESETS: { valor: Filtros["periodo"]; label: string }[] = [
  { valor: "caixa_atual", label: "Caixa Atual" },
  { valor: "7d", label: "7 dias" },
  { valor: "30d", label: "30 dias" },
  { valor: "90d", label: "90 dias" },
  { valor: "1a", label: "1 ano" },
];

const GRAFICOS_DISPONIVEIS = [
  { id: "dia", label: "Vendas por Dia" },
  { id: "acumulada", label: "Receita Acumulada" },
  { id: "dispositivo", label: "Receita por Dispositivo" },
  { id: "produtos", label: "Top Produtos" },
] as const;

type GraficoId = (typeof GRAFICOS_DISPONIVEIS)[number]["id"];

const NAV_ITEMS = [
  { label: "Dashboard", active: true },
  { label: "Vendas", active: false },
  { label: "Caixa", active: false },
  { label: "Estoque", active: false },
  { label: "Financeiro", active: false },
  { label: "Etiquetas", active: false },
];

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarPct(valor: number) {
  return `${valor >= 0 ? "+" : ""}${valor.toFixed(1)}%`;
}

function DeltaBadge({ valor }: { valor: number | null }) {
  if (valor === null) {
    return <span className="vendas-card-hint">Sem período anterior para comparar</span>;
  }
  const positivo = valor >= 0;
  return (
    <span className={`vendas-card-hint vendas-delta ${positivo ? "vendas-delta-alta" : "vendas-delta-baixa"}`}>
      {positivo ? "▲" : "▼"} {formatarPct(valor)} vs período anterior
    </span>
  );
}

function formatarRelativo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const dias = Math.floor(diffMs / 86_400_000);
  if (dias <= 0) {
    const horas = Math.max(0, Math.floor(diffMs / 3_600_000));
    return horas <= 0 ? "agora" : `${horas}h atrás`;
  }
  return `${dias}d atrás`;
}

export default function Vendas() {
  const router = useRouter();
  // Começa igual em servidor e cliente (null) — o sessionStorage só existe no
  // navegador, então é lido depois de montar, nunca no render inicial (evita
  // hydration mismatch).
  const [empresa, setEmpresa] = useState<EmpresaSessao | null>(null);
  const [filtros, setFiltros] = useState<Filtros>({ periodo: "caixa_atual", dispositivo: "", de: "", ate: "" });
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graficosVisiveis, setGraficosVisiveis] = useState<GraficoId[]>([
    "dia",
    "acumulada",
    "dispositivo",
    "produtos",
  ]);

  function alternarGrafico(id: GraficoId) {
    setGraficosVisiveis((atual) => {
      if (atual.includes(id)) {
        // mantém pelo menos um gráfico sempre visível
        return atual.length > 1 ? atual.filter((g) => g !== id) : atual;
      }
      return [...atual, id];
    });
  }

  const carregar = useCallback(async (empresaId: string, f: Filtros) => {
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ empresa_id: empresaId, periodo: f.periodo });
    if (f.dispositivo) qs.set("dispositivo", f.dispositivo);
    if (f.periodo === "custom" && f.de && f.ate) {
      qs.set("de", f.de);
      qs.set("ate", f.ate);
    }

    try {
      const response = await fetch(`/api/vendas?${qs.toString()}`);
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível carregar os dados de vendas");
      }
      setResumo(data as Resumo);
      // Debug rápido: confirma se essa empresa já tem algum sincronizador
      // conectado (já mandou dados alguma vez) ou não.
      console.log("Sincronizador conectado:", Boolean((data as Resumo).ultima_sincronizacao));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os dados de vendas");
    } finally {
      setLoading(false);
    }
  }, []);

  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      const raw = sessionStorage.getItem("empresa");
      setEmpresa(raw ? (JSON.parse(raw) as EmpresaSessao) : null);
      setPronto(true);
    });
  }, []);

  useEffect(() => {
    if (!pronto) return;

    if (!empresa) {
      router.replace("/login");
      return;
    }
    if (empresa.is_master) {
      router.replace("/master");
      return;
    }
    if (empresa.is_admin) {
      router.replace("/painel");
      return;
    }

    // Adia para o próximo microtask: carregar() atualiza estado logo na primeira
    // linha, e chamá-la sincronamente aqui dispararia um set-state-in-effect.
    Promise.resolve().then(() => {
      carregar(empresa.id, { periodo: "caixa_atual", dispositivo: "", de: "", ate: "" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, empresa, router]);

  function aplicarPreset(periodo: Filtros["periodo"]) {
    if (!empresa) return;
    const novo = { ...filtros, periodo };
    setFiltros(novo);
    carregar(empresa.id, novo);
  }

  function aplicarDispositivo(dispositivo: string) {
    if (!empresa) return;
    const novo = { ...filtros, dispositivo };
    setFiltros(novo);
    carregar(empresa.id, novo);
  }

  function atualizar() {
    if (!empresa) return;
    const usarCustom = filtros.de && filtros.ate;
    const novo: Filtros = usarCustom ? { ...filtros, periodo: "custom" } : filtros;
    setFiltros(novo);
    carregar(empresa.id, novo);
  }

  function sair() {
    sessionStorage.removeItem("empresa");
    router.push("/login");
  }

  const receitaAcumulada = (resumo?.vendas_por_dia ?? []).reduce<{ dia: string; acumulado: number }[]>(
    (acc, d) => {
      const anterior = acc.length > 0 ? acc[acc.length - 1].acumulado : 0;
      return [...acc, { dia: d.dia, acumulado: anterior + Number(d.total) }];
    },
    []
  );

  return (
    <div className="vendas-container">
      <header className="vendas-topbar">
        <div className="vendas-topbar-empresa">
          {empresa && (
            <>
              <strong>{empresa.nome}</strong>
              {empresa.cpf_cnpj && <span>{empresa.cpf_cnpj}</span>}
            </>
          )}
        </div>

        <nav className="vendas-nav">
          {NAV_ITEMS.map((item) => (
            <span key={item.label} className={`vendas-nav-item${item.active ? " vendas-nav-item-active" : ""}`}>
              {item.label}
            </span>
          ))}
        </nav>

        {empresa && (
          <div className="vendas-topbar-user">
            <div className="vendas-avatar">{empresa.nome.charAt(0).toUpperCase()}</div>
            <span>{empresa.nome}</span>
            <button className="vendas-sair" onClick={sair}>
              Sair
            </button>
          </div>
        )}
      </header>

      <main className="vendas-main">
        <section className="vendas-filtros">
          <span className="vendas-filtros-label">Período:</span>
          {PRESETS.map((p) => (
            <button
              key={p.valor}
              className={`vendas-preset${filtros.periodo === p.valor ? " vendas-preset-ativo" : ""}`}
              onClick={() => aplicarPreset(p.valor)}
            >
              {p.label}
            </button>
          ))}

          <select
            className="vendas-select"
            value={filtros.dispositivo}
            onChange={(e) => aplicarDispositivo(e.target.value)}
          >
            <option value="">Todos os dispositivos</option>
            {resumo?.dispositivos.map((d) => (
              <option key={d.id_dispositivo} value={d.id_dispositivo}>
                {d.label}
              </option>
            ))}
          </select>

          <input
            type="date"
            className="vendas-date"
            value={filtros.de}
            onChange={(e) => setFiltros({ ...filtros, de: e.target.value })}
          />
          <span className="vendas-filtros-a">a</span>
          <input
            type="date"
            className="vendas-date"
            value={filtros.ate}
            onChange={(e) => setFiltros({ ...filtros, ate: e.target.value })}
          />

          <button className="vendas-excel" disabled title="Em breve">
            Excel
          </button>
          <button className="vendas-atualizar" onClick={atualizar} disabled={loading}>
            {loading ? "Atualizando..." : "Atualizar"}
          </button>

          {resumo?.ultima_sincronizacao && (
            <span className="vendas-ultima-sync-chip">
              Última atualização: <strong>{formatarRelativo(resumo.ultima_sincronizacao.quando)}</strong>
            </span>
          )}
        </section>

        {error && <p className="vendas-erro">{error}</p>}

        {resumo && resumo.caixas_abertos.length > 0 && (
          <section className="vendas-caixas">
            <span className="vendas-caixas-dot" />
            <strong>{resumo.caixas_abertos.length} caixa(s) aberto(s)</strong>
            <div className="vendas-caixas-lista">
              {resumo.caixas_abertos.map((c) => (
                <span key={c.id_dispositivo} className="vendas-caixa-chip">
                  <span className="vendas-caixas-dot" /> {c.label} · {c.horas_aberto}h
                </span>
              ))}
            </div>
          </section>
        )}

        {resumo && (
          <>
            <section className="vendas-stats">
              <div className="vendas-card">
                <span className="vendas-card-label">Receita Total</span>
                <strong className="vendas-card-value">{formatarMoeda(resumo.resumo.receita_total)}</strong>
                <DeltaBadge valor={resumo.resumo.crescimento_receita_pct} />
              </div>
              <div className="vendas-card">
                <span className="vendas-card-label">Total Vendas</span>
                <strong className="vendas-card-value">{resumo.resumo.total_vendas}</strong>
                <DeltaBadge valor={resumo.resumo.crescimento_vendas_pct} />
              </div>
              <div className="vendas-card">
                <span className="vendas-card-label">Margem Bruta</span>
                <strong className="vendas-card-value">{formatarMoeda(resumo.resumo.margem_bruta)}</strong>
                <span className="vendas-card-hint">
                  {resumo.resumo.margem_percentual !== null
                    ? `${resumo.resumo.margem_percentual.toFixed(1)}% da receita`
                    : "—"}
                </span>
              </div>
              <div className="vendas-card">
                <span className="vendas-card-label">Top Produto</span>
                <strong className="vendas-card-value vendas-card-value-texto">
                  {resumo.resumo.top_produto ? resumo.resumo.top_produto.descricao : "—"}
                </strong>
                <span className="vendas-card-hint">
                  {resumo.resumo.top_produto ? `${resumo.resumo.top_produto.percentual.toFixed(1)}% da receita de itens` : "—"}
                </span>
              </div>
            </section>

            <section className="vendas-graficos-seletor">
              <span className="vendas-filtros-label">Gráficos:</span>
              {GRAFICOS_DISPONIVEIS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  className={`vendas-preset${graficosVisiveis.includes(g.id) ? " vendas-preset-ativo" : ""}`}
                  onClick={() => alternarGrafico(g.id)}
                >
                  {g.label}
                </button>
              ))}
            </section>

            <section
              className={`vendas-graficos vendas-graficos-${graficosVisiveis.length}`}
            >
              {graficosVisiveis.includes("dia") && (
                <div className="vendas-grafico-card">
                  <h2>Vendas por Dia</h2>
                  <BarChart data={resumo.vendas_por_dia.map((d) => ({ dia: d.dia, total: Number(d.total) }))} />
                </div>
              )}
              {graficosVisiveis.includes("acumulada") && (
                <div className="vendas-grafico-card">
                  <h2>Receita Acumulada</h2>
                  <LineChart data={receitaAcumulada} />
                </div>
              )}
              {graficosVisiveis.includes("dispositivo") && (
                <div className="vendas-grafico-card">
                  <h2>Receita por Dispositivo</h2>
                  <DonutChart
                    data={resumo.receita_por_dispositivo.map((d) => ({
                      label: d.label,
                      valor: Number(d.total),
                      percentual: d.percentual,
                    }))}
                  />
                </div>
              )}
              {graficosVisiveis.includes("produtos") && (
                <div className="vendas-grafico-card">
                  <h2>Top Produtos</h2>
                  {resumo.top_produtos.length === 0 ? (
                    <p className="vendas-chart-vazio">Sem vendas no período selecionado.</p>
                  ) : (
                    <ul className="vendas-top-produtos">
                      {resumo.top_produtos.map((tp) => (
                        <li key={tp.descricao}>
                          <div className="vendas-top-produto-info">
                            <span>{tp.descricao}</span>
                            <strong>{formatarMoeda(Number(tp.valor))}</strong>
                          </div>
                          <div className="vendas-top-produto-barra">
                            <div
                              className="vendas-top-produto-barra-fill"
                              style={{ width: `${Math.min(100, tp.percentual)}%` }}
                            />
                          </div>
                          <span className="vendas-top-produto-pct">{tp.percentual.toFixed(1)}%</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
