"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
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

interface FilialInfo {
  id: string;
  nome: string;
  ativo: boolean;
  ja_sincronizou: boolean;
  ultima_sincronizacao: string | null;
  identificacao: { razao_social: string | null; nome_fantasia: string | null; cpf_cnpj: string | null } | null;
}

interface SubUsuarioSessao {
  id: string;
  nome: string;
  acesso_total: boolean;
  filiais: string[];
  permissoes: {
    ver_dashboards: boolean;
    ver_relatorios: boolean;
    lancar_financeiro: boolean;
    editar_excluir: boolean;
  };
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

interface Filial {
  id: string;
  nome: string;
  ativo: boolean;
}

interface SubUsuario {
  id: string;
  nome: string;
  acesso_total: boolean;
  pode_ver_dashboards: boolean;
  pode_ver_relatorios: boolean;
  pode_lancar_financeiro: boolean;
  pode_editar_excluir: boolean;
  ativo: boolean;
  filiais: { filial_id: string; filial_nome: string }[];
}

function UsuariosPanel({ empresaId }: { empresaId: string }) {
  const [usuarios, setUsuarios] = useState<SubUsuario[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [limite, setLimite] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [senhaGerada, setSenhaGerada] = useState<{ nome: string; senha: string } | null>(null);
  const [senhaCopiada, setSenhaCopiada] = useState(false);

  async function copiarSenha(senha: string) {
    try {
      await navigator.clipboard.writeText(senha);
      setSenhaCopiada(true);
      setTimeout(() => setSenhaCopiada(false), 2000);
    } catch {
      // Clipboard indisponível (ex.: contexto não seguro) — ignora silenciosamente.
    }
  }

  const [nome, setNome] = useState("");
  const [acessoTotal, setAcessoTotal] = useState(true);
  const [filiaisSelecionadas, setFiliaisSelecionadas] = useState<string[]>([]);
  const [permissoes, setPermissoes] = useState({
    pode_ver_dashboards: true,
    pode_ver_relatorios: true,
    pode_lancar_financeiro: false,
    pode_editar_excluir: false,
  });
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [resUsuarios, resFiliais] = await Promise.all([
        fetch(`/api/vendas/usuarios?empresa_id=${empresaId}`),
        fetch(`/api/vendas/filiais?empresa_id=${empresaId}`),
      ]);
      const dataUsuarios = await resUsuarios.json();
      const dataFiliais = await resFiliais.json();
      if (!resUsuarios.ok) throw new Error(dataUsuarios.error ?? "Não foi possível carregar os usuários");
      if (!resFiliais.ok) throw new Error(dataFiliais.error ?? "Não foi possível carregar as filiais");
      setUsuarios(dataUsuarios.usuarios);
      setLimite(dataUsuarios.limite_usuarios);
      setFiliais(dataFiliais.filiais);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao carregar dados");
    } finally {
      setLoading(false);
    }
  }, [empresaId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function criarUsuario(event: FormEvent) {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const response = await fetch("/api/vendas/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          nome,
          acesso_total: acessoTotal,
          filiais: acessoTotal ? [] : filiaisSelecionadas,
          ...permissoes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o usuário");

      setSenhaGerada({ nome, senha: data.senha });
      setNome("");
      setAcessoTotal(true);
      setFiliaisSelecionadas([]);
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao criar usuário");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(usuario: SubUsuario) {
    if (usuario.ativo) {
      await fetch(`/api/vendas/usuarios/${usuario.id}?empresa_id=${empresaId}`, { method: "DELETE" });
    } else {
      await fetch(`/api/vendas/usuarios/${usuario.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, ativo: true }),
      });
    }
    await carregar();
  }

  return (
    <section className="vendas-filtros" style={{ flexDirection: "column", alignItems: "stretch", gap: 16 }}>
      <h2 style={{ margin: 0 }}>Usuários</h2>
      <p style={{ margin: 0, color: "var(--cor-texto-suave, #666)" }}>
        {limite !== null ? `${usuarios.filter((u) => u.ativo).length} de ${limite} usuário(s) usado(s)` : "Sem limite de usuários"}
      </p>

      {erro && <p className="vendas-erro">{erro}</p>}

      {senhaGerada && (
        <div className="vendas-caixas" style={{ flexDirection: "column", alignItems: "flex-start" }}>
          <strong>Usuário &quot;{senhaGerada.nome}&quot; criado!</strong>
          <p style={{ display: "flex", alignItems: "center", gap: 8 }}>
            Senha (mostrada uma única vez): <code>{senhaGerada.senha}</code>
            <button type="button" onClick={() => copiarSenha(senhaGerada.senha)}>
              {senhaCopiada ? "Copiado!" : "Copiar"}
            </button>
          </p>
          <button type="button" onClick={() => setSenhaGerada(null)}>Fechar</button>
        </div>
      )}

      <form onSubmit={criarUsuario} style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 480 }}>
        <label>
          Nome
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>

        <label>
          <input type="checkbox" checked={acessoTotal} onChange={(e) => setAcessoTotal(e.target.checked)} />
          {" "}Acesso total (todas as filiais, atuais e futuras)
        </label>

        {!acessoTotal && (
          <fieldset>
            <legend>Filiais permitidas</legend>
            {filiais.map((f) => (
              <label key={f.id} style={{ display: "block" }}>
                <input
                  type="checkbox"
                  checked={filiaisSelecionadas.includes(f.id)}
                  onChange={(e) =>
                    setFiliaisSelecionadas((atual) =>
                      e.target.checked ? [...atual, f.id] : atual.filter((id) => id !== f.id)
                    )
                  }
                />{" "}
                {f.nome}
              </label>
            ))}
            {filiais.length === 0 && <p>Nenhuma filial cadastrada ainda.</p>}
          </fieldset>
        )}

        <fieldset>
          <legend>Permissões</legend>
          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={permissoes.pode_ver_dashboards}
              onChange={(e) => setPermissoes({ ...permissoes, pode_ver_dashboards: e.target.checked })}
            />{" "}Ver dashboards
          </label>
          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={permissoes.pode_ver_relatorios}
              onChange={(e) => setPermissoes({ ...permissoes, pode_ver_relatorios: e.target.checked })}
            />{" "}Ver relatórios
          </label>
          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={permissoes.pode_lancar_financeiro}
              onChange={(e) => setPermissoes({ ...permissoes, pode_lancar_financeiro: e.target.checked })}
            />{" "}Lançar financeiro
          </label>
          <label style={{ display: "block" }}>
            <input
              type="checkbox"
              checked={permissoes.pode_editar_excluir}
              onChange={(e) => setPermissoes({ ...permissoes, pode_editar_excluir: e.target.checked })}
            />{" "}Editar/excluir lançamentos
          </label>
        </fieldset>

        <button type="submit" disabled={salvando}>
          {salvando ? "Criando..." : "Criar usuário"}
        </button>
      </form>

      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th>Acesso</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={4}>Carregando...</td>
            </tr>
          )}
          {!loading && usuarios.length === 0 && (
            <tr>
              <td colSpan={4}>Nenhum usuário cadastrado ainda.</td>
            </tr>
          )}
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nome}</td>
              <td>{u.acesso_total ? "Todas as filiais" : u.filiais.map((f) => f.filial_nome).join(", ") || "Nenhuma"}</td>
              <td>{u.ativo ? "Ativo" : "Desativado"}</td>
              <td>
                <button type="button" onClick={() => alternarAtivo(u)}>
                  {u.ativo ? "Desativar" : "Reativar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

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
  const [usuario, setUsuario] = useState<SubUsuarioSessao | null>(null);
  const [aba, setAba] = useState<"dashboard" | "usuarios">("dashboard");
  const [filtros, setFiltros] = useState<Filtros>({ periodo: "caixa_atual", dispositivo: "", de: "", ate: "" });
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filiais, setFiliais] = useState<FilialInfo[]>([]);
  const [filiaisProntas, setFiliaisProntas] = useState(false);
  const [filialAtiva, setFilialAtiva] = useState<string | null>(null);
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

  const carregar = useCallback(async (empresaId: string, f: Filtros, filialId: string | null) => {
    setLoading(true);
    setError(null);

    const qs = new URLSearchParams({ empresa_id: empresaId, periodo: f.periodo });
    if (filialId) qs.set("filial_id", filialId);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível carregar os dados de vendas");
    } finally {
      setLoading(false);
    }
  }, []);

  // Filiais que este login pode ver: Master e subusuário com acesso_total veem
  // todas; um subusuário restrito só vê as que foram liberadas pra ele.
  const filiaisVisiveis =
    usuario && !usuario.acesso_total ? filiais.filter((f) => usuario.filiais.includes(f.id)) : filiais;
  const permiteVisaoAgregada = !usuario || usuario.acesso_total;

  const carregarFiliais = useCallback(async (empresaId: string) => {
    try {
      const response = await fetch(`/api/vendas/filiais?empresa_id=${empresaId}`);
      const data = await response.json();
      if (response.ok) setFiliais(data.filiais as FilialInfo[]);
    } finally {
      setFiliaisProntas(true);
    }
  }, []);

  function selecionarFilial(filialId: string | null) {
    if (!empresa) return;
    setFilialAtiva(filialId);
    carregar(empresa.id, filtros, filialId);
  }

  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      const raw = sessionStorage.getItem("empresa");
      setEmpresa(raw ? (JSON.parse(raw) as EmpresaSessao) : null);
      const rawUsuario = sessionStorage.getItem("usuario");
      setUsuario(rawUsuario ? (JSON.parse(rawUsuario) as SubUsuarioSessao) : null);
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

    // Adia para o próximo microtask: setState atualiza logo na primeira linha,
    // e chamar sincronamente aqui dispararia um set-state-in-effect.
    Promise.resolve().then(() => {
      carregarFiliais(empresa.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, empresa, router]);

  // Assim que a lista de filiais chega, escolhe a padrão: "Todas" (agregado)
  // se houver mais de uma e o login tiver visão agregada liberada, senão a
  // primeira (e única) filial visível.
  useEffect(() => {
    if (!filiaisProntas || !empresa) return;
    if (filiaisVisiveis.length === 0) return; // empty state — nada pra carregar

    const padrao = permiteVisaoAgregada && filiaisVisiveis.length > 1 ? null : filiaisVisiveis[0].id;
    setFilialAtiva(padrao);
    carregar(empresa.id, filtros, padrao);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filiaisProntas, empresa]);

  function aplicarPreset(periodo: Filtros["periodo"]) {
    if (!empresa) return;
    const novo = { ...filtros, periodo };
    setFiltros(novo);
    carregar(empresa.id, novo, filialAtiva);
  }

  function aplicarDispositivo(dispositivo: string) {
    if (!empresa) return;
    const novo = { ...filtros, dispositivo };
    setFiltros(novo);
    carregar(empresa.id, novo, filialAtiva);
  }

  function atualizar() {
    if (!empresa) return;
    const usarCustom = filtros.de && filtros.ate;
    const novo: Filtros = usarCustom ? { ...filtros, periodo: "custom" } : filtros;
    setFiltros(novo);
    carregar(empresa.id, novo, filialAtiva);
  }

  function sair() {
    sessionStorage.removeItem("empresa");
    sessionStorage.removeItem("usuario");
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
            <span
              key={item.label}
              className={`vendas-nav-item${item.active && aba === "dashboard" ? " vendas-nav-item-active" : ""}`}
              onClick={() => setAba("dashboard")}
              style={{ cursor: "pointer" }}
            >
              {item.label}
            </span>
          ))}
          {!usuario && (
            <span
              className={`vendas-nav-item${aba === "usuarios" ? " vendas-nav-item-active" : ""}`}
              onClick={() => setAba("usuarios")}
              style={{ cursor: "pointer" }}
            >
              Usuários
            </span>
          )}
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
        {aba === "usuarios" && empresa ? (
          <UsuariosPanel empresaId={empresa.id} />
        ) : !filiaisProntas ? (
          <section className="vendas-filtros">
            <p>Carregando...</p>
          </section>
        ) : filiaisVisiveis.length === 0 ? (
          <section className="vendas-empty-state">
            <h2>Nenhuma empresa ativa</h2>
            <p>
              Assim que o sincronizador conectar e ativar o banco de dados de uma filial, os dados
              aparecem aqui automaticamente.
            </p>
          </section>
        ) : (
        <>
        {filiaisVisiveis.length > 1 && (
          <nav className="vendas-filial-tabs">
            {permiteVisaoAgregada && (
              <button
                className={`vendas-filial-tab${filialAtiva === null ? " vendas-filial-tab-ativa" : ""}`}
                onClick={() => selecionarFilial(null)}
              >
                Todas
              </button>
            )}
            {filiaisVisiveis.map((f) => (
              <button
                key={f.id}
                className={`vendas-filial-tab${filialAtiva === f.id ? " vendas-filial-tab-ativa" : ""}`}
                onClick={() => selecionarFilial(f.id)}
              >
                {f.nome}
              </button>
            ))}
          </nav>
        )}

        {filialAtiva && (
          (() => {
            const filialSelecionada = filiaisVisiveis.find((f) => f.id === filialAtiva);
            const id = filialSelecionada?.identificacao;
            return (
              <p className="vendas-filial-identificacao">
                {id
                  ? [id.razao_social, id.nome_fantasia, id.cpf_cnpj].filter(Boolean).join(" · ")
                  : "Aguardando o sincronizador enviar os dados da empresa..."}
              </p>
            );
          })()
        )}

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
        </>
        )}
      </main>
    </div>
  );
}
