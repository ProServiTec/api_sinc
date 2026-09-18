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

type AbaPrincipal = "dashboard" | "vendas" | "caixa" | "estoque" | "financeiro" | "etiquetas" | "usuarios";

const NAV_ITEMS: { label: string; aba: AbaPrincipal | null }[] = [
  { label: "Dashboard", aba: "dashboard" },
  { label: "Vendas", aba: "vendas" },
  { label: "Caixa", aba: "caixa" },
  { label: "Estoque", aba: "estoque" },
  { label: "Financeiro", aba: "financeiro" },
  { label: "Etiquetas", aba: "etiquetas" },
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

interface VendaLista {
  id_venda: string;
  codigo_venda: number;
  data_hora_criado: string;
  nome_cliente: string | null;
  valor_total: number;
  cancelada_pelo_usuario: string;
  id_dispositivo: string;
  codigo_dispositivo: number | null;
  qtd_itens: number;
}

function VendasListaPanel({
  empresaId,
  filialId,
  filtros,
}: {
  empresaId: string;
  filialId: string | null;
  filtros: Filtros;
}) {
  const [vendas, setVendas] = useState<VendaLista[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const porPagina = 25;

  useEffect(() => {
    setPagina(1);
  }, [empresaId, filialId, filtros]);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    const qs = new URLSearchParams({
      empresa_id: empresaId,
      periodo: filtros.periodo,
      pagina: String(pagina),
      por_pagina: String(porPagina),
    });
    if (filialId) qs.set("filial_id", filialId);
    if (filtros.dispositivo) qs.set("dispositivo", filtros.dispositivo);
    if (filtros.periodo === "custom" && filtros.de && filtros.ate) {
      qs.set("de", filtros.de);
      qs.set("ate", filtros.ate);
    }

    fetch(`/api/vendas/lista?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Não foi possível carregar as vendas");
        setVendas(data.vendas);
        setTotal(data.total);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar vendas"))
      .finally(() => setLoading(false));
  }, [empresaId, filialId, filtros, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <section className="vendas-caixa-section">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h2 className="vendas-caixa-title">
          Vendas{" "}
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: "normal" }}>
            {total} vendas · {formatarMoeda(vendas.reduce((acc, v) => acc + Number(v.valor_total), 0))}
          </span>
        </h2>
      </div>
      
      {erro && <p className="vendas-erro">{erro}</p>}
      
      {/* ── Filtros adicionais (Operador, Forma Pgto, Tipo, Dispositivo) ── */}
      <div className="vendas-filtros" style={{ marginBottom: 0 }}>
        <select className="vendas-select">
          <option>Todos operadores</option>
        </select>
        <select className="vendas-select">
          <option>Todas formas pgto</option>
        </select>
        <select className="vendas-select">
          <option>Todos tipos</option>
        </select>
        <select className="vendas-select">
          <option>Todos dispositivos</option>
        </select>
      </div>

      <div className="vendas-caixa-bloco">
        {loading ? (
          <div className="vendas-caixa-bloco-vazio">
            <span className="vendas-spinner vendas-spinner-sm" style={{ marginRight: 8 }} />
            Carregando vendas...
          </div>
        ) : vendas.length === 0 ? (
          <div className="vendas-caixa-bloco-vazio">Nenhuma venda encontrada</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="vendas-caixa-table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  <th>Cliente</th>
                  <th>Itens</th>
                  <th>Dispositivo</th>
                  <th>Total</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {vendas.map((v) => (
                  <tr key={v.id_venda}>
                    <td>{v.codigo_venda}</td>
                    <td>{new Date(v.data_hora_criado).toLocaleString("pt-BR")}</td>
                    <td>{v.nome_cliente ?? "—"}</td>
                    <td>{v.qtd_itens}</td>
                    <td>{v.codigo_dispositivo ? `Disp. ${v.codigo_dispositivo}` : v.id_dispositivo.slice(0, 8)}</td>
                    <td style={{ fontWeight: 600 }}>{formatarMoeda(Number(v.valor_total))}</td>
                    <td>
                      <span className={`vendas-fin-badge vendas-fin-badge-${v.cancelada_pelo_usuario === "1" ? "vencida" : "pago"}`}>
                        {v.cancelada_pelo_usuario === "1" ? "Cancelada" : "Concluída"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="vendas-fin-paginacao" style={{ marginTop: "1rem" }}>
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <span>Página {pagina} de {totalPaginas}</span>
          <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}

interface CaixaSessao {
  id_fechamento_caixa: string;
  data_abertura: string;
  data_fechamento: string | null;
  id_dispositivo: string;
  codigo_dispositivo: number | null;
  total_vendido: number;
  total_sangrias: number;
  total_suprimentos: number;
}

function CaixaPanel({ empresaId, filialId }: { empresaId: string; filialId: string | null }) {
  const [caixas, setCaixas] = useState<CaixaSessao[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const porPagina = 25;

  useEffect(() => {
    setPagina(1);
  }, [empresaId, filialId]);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    const qs = new URLSearchParams({ empresa_id: empresaId, pagina: String(pagina), por_pagina: String(porPagina) });
    if (filialId) qs.set("filial_id", filialId);

    fetch(`/api/vendas/caixa?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Não foi possível carregar os caixas");
        setCaixas(data.caixas);
        setTotal(data.total);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar caixas"))
      .finally(() => setLoading(false));
  }, [empresaId, filialId, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  const totaisGerais = caixas.reduce(
    (acc, c) => {
      acc.vendido += Number(c.total_vendido);
      acc.sangrias += Number(c.total_sangrias);
      acc.suprimentos += Number(c.total_suprimentos);
      return acc;
    },
    { vendido: 0, sangrias: 0, suprimentos: 0 }
  );

  return (
    <section className="vendas-caixa-section">
      <h2 className="vendas-caixa-title">Controle de Caixa</h2>
      {erro && <p className="vendas-erro">{erro}</p>}

      {/* Cards de resumo de caixa */}
      <div className="vendas-caixa-cards">
        <div className="vendas-caixa-card">
          <span>Fechamentos</span>
          <strong>{total}</strong>
        </div>
        <div className="vendas-caixa-card">
          <span>Total Fechado</span>
          <strong>{formatarMoeda(totaisGerais.vendido)}</strong>
        </div>
        <div className="vendas-caixa-card vendas-caixa-card-red">
          <span>Sangrias</span>
          <strong>{formatarMoeda(totaisGerais.sangrias)}</strong>
        </div>
        <div className="vendas-caixa-card vendas-caixa-card-green">
          <span>Suprimentos</span>
          <strong>{formatarMoeda(totaisGerais.suprimentos)}</strong>
        </div>
      </div>

      <div className="vendas-caixa-bloco" style={{ marginTop: "1rem" }}>
        <div className="vendas-caixa-bloco-header">
          Fechamentos de Caixa — {total} encontrados
        </div>
        
        {loading ? (
          <div className="vendas-caixa-bloco-vazio">
            <span className="vendas-spinner vendas-spinner-sm" style={{ marginRight: 8 }} />
            Carregando fechamentos...
          </div>
        ) : caixas.length === 0 ? (
          <div className="vendas-caixa-bloco-vazio">Nenhuma sessão de caixa encontrada.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="vendas-caixa-table">
              <thead>
                <tr>
                  <th>Abertura</th>
                  <th>Fechamento</th>
                  <th>Dispositivo</th>
                  <th>Vendido</th>
                  <th>Sangrias</th>
                  <th>Suprimentos</th>
                </tr>
              </thead>
              <tbody>
                {caixas.map((c) => (
                  <tr key={c.id_fechamento_caixa}>
                    <td>{new Date(c.data_abertura).toLocaleString("pt-BR")}</td>
                    <td>{c.data_fechamento ? new Date(c.data_fechamento).toLocaleString("pt-BR") : "Em aberto"}</td>
                    <td>{c.codigo_dispositivo ? `Disp. ${c.codigo_dispositivo}` : c.id_dispositivo.slice(0, 8)}</td>
                    <td style={{ fontWeight: 600 }}>{formatarMoeda(Number(c.total_vendido))}</td>
                    <td style={{ color: "var(--red)" }}>{formatarMoeda(Number(c.total_sangrias))}</td>
                    <td style={{ color: "var(--green)" }}>{formatarMoeda(Number(c.total_suprimentos))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPaginas > 1 && (
        <div className="vendas-fin-paginacao">
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <span>Página {pagina} de {totalPaginas}</span>
          <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}

interface ProdutoEstoque {
  id_produto: string;
  descricao: string;
  preco_custo: number;
  preco_venda: number;
  qtd_estoque: number;
  qtd_estoque_minimo: number;
  grupo: string | null;
}

function EstoquePanel({ empresaId, filialId }: { empresaId: string; filialId: string | null }) {
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [busca, setBusca] = useState("");
  const [somenteBaixoEstoque, setSomenteBaixoEstoque] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const porPagina = 50;

  useEffect(() => {
    setPagina(1);
  }, [empresaId, filialId, busca, somenteBaixoEstoque]);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    const qs = new URLSearchParams({ empresa_id: empresaId, pagina: String(pagina), por_pagina: String(porPagina) });
    if (filialId) qs.set("filial_id", filialId);
    if (busca) qs.set("busca", busca);
    if (somenteBaixoEstoque) qs.set("somente_baixo_estoque", "1");

    fetch(`/api/vendas/estoque?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Não foi possível carregar o estoque");
        setProdutos(data.produtos);
        setTotal(data.total);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar estoque"))
      .finally(() => setLoading(false));
  }, [empresaId, filialId, busca, somenteBaixoEstoque, pagina]);

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <section className="vendas-filtros" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Estoque ({total})</h2>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="Buscar produto..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <label>
          <input
            type="checkbox"
            checked={somenteBaixoEstoque}
            onChange={(e) => setSomenteBaixoEstoque(e.target.checked)}
          />{" "}
          Só estoque baixo
        </label>
      </div>
      {erro && <p className="vendas-erro">{erro}</p>}
      <table>
        <thead>
          <tr>
            <th>Produto</th>
            <th>Grupo</th>
            <th>Estoque</th>
            <th>Mínimo</th>
            <th>Custo</th>
            <th>Venda</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6}>Carregando...</td>
            </tr>
          )}
          {!loading && produtos.length === 0 && (
            <tr>
              <td colSpan={6}>Nenhum produto encontrado.</td>
            </tr>
          )}
          {produtos.map((p) => {
            const baixoEstoque = Number(p.qtd_estoque) <= Number(p.qtd_estoque_minimo);
            return (
              <tr key={p.id_produto} style={baixoEstoque ? { color: "#c0392b" } : undefined}>
                <td>{p.descricao}</td>
                <td>{p.grupo ?? "—"}</td>
                <td>{Number(p.qtd_estoque)}</td>
                <td>{Number(p.qtd_estoque_minimo)}</td>
                <td>{formatarMoeda(Number(p.preco_custo))}</td>
                <td>{formatarMoeda(Number(p.preco_venda))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {totalPaginas > 1 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </button>
        </div>
      )}
    </section>
  );
}

interface ContaFinanceira {
  id_conta_pagar_receber: string;
  tipo_conta: number;
  valor: number;
  emissao?: string;
  vencimento: string;
  documento: string | null;
  nome_cliente: string | null;
  valor_pago: number;
}

interface ResumoFinanceiro {
  pendente: number;
  pago_parcial: number;
  vencidos: number;
  pagos: number;
  total: number;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function statusConta(c: ContaFinanceira): "Pago" | "Pago Parcial" | "Vencida" | "Pendente" {
  if (c.valor_pago >= c.valor) return "Pago";
  if (c.valor_pago > 0) return "Pago Parcial";
  if (new Date(c.vencimento) < new Date()) return "Vencida";
  return "Pendente";
}

function exportarCsv(contas: ContaFinanceira[], tipo: "receber" | "pagar") {
  const linhas = [
    ["Cliente/Documento", "Valor", "Pago", "Vencimento", "Status"],
    ...contas.map((c) => [
      c.nome_cliente ?? c.documento ?? "—",
      String(c.valor),
      String(c.valor_pago),
      new Date(c.vencimento).toLocaleDateString("pt-BR"),
      statusConta(c),
    ]),
  ];
  const csv = linhas.map((l) => l.map((v) => `"${v.replace(/"/g, '""')}"`).join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `financeiro-${tipo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function FinanceiroPanel({
  empresaId,
  filialId,
  filtros,
  setFiltros,
  dispositivos,
}: {
  empresaId: string;
  filialId: string | null;
  filtros: Filtros;
  setFiltros: (f: Filtros) => void;
  dispositivos: { id_dispositivo: string; label: string }[];
}) {
  const [tipo, setTipo] = useState<"receber" | "pagar">("receber");
  const fallback = new Date();
  const dateFromFiltros = filtros.de ? new Date(filtros.de + "T12:00:00Z") : fallback;
  const mes = dateFromFiltros.getUTCMonth() + 1;
  const ano = dateFromFiltros.getUTCFullYear();
  const dispositivoId = filtros.dispositivo || "";

  function handleSetMes(novoMes: number) {
    const start = new Date(Date.UTC(ano, novoMes - 1, 1));
    const end = new Date(Date.UTC(ano, novoMes, 0));
    setFiltros({
      ...filtros,
      periodo: "custom",
      de: start.toISOString().split("T")[0],
      ate: end.toISOString().split("T")[0],
    });
  }

  function handleSetAno(novoAno: number) {
    const start = new Date(Date.UTC(novoAno, mes - 1, 1));
    const end = new Date(Date.UTC(novoAno, mes, 0));
    setFiltros({
      ...filtros,
      periodo: "custom",
      de: start.toISOString().split("T")[0],
      ate: end.toISOString().split("T")[0],
    });
  }

  const [buscaCliente, setBuscaCliente] = useState("");
  const [contas, setContas] = useState<ContaFinanceira[]>([]);
  const [resumo, setResumo] = useState<ResumoFinanceiro | null>(null);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const porPagina = 25;

  const [isNovaContaModalOpen, setIsNovaContaModalOpen] = useState(false);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setPagina(1);
  }, [empresaId, filialId, tipo, mes, ano, buscaCliente, dispositivoId]);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    const qs = new URLSearchParams({
      empresa_id: empresaId,
      tipo,
      mes: String(mes),
      ano: String(ano),
      pagina: String(pagina),
      por_pagina: String(porPagina),
    });
    if (filialId) qs.set("filial_id", filialId);
    if (buscaCliente) qs.set("busca_cliente", buscaCliente);
    if (dispositivoId) qs.set("dispositivo_id", dispositivoId);

    fetch(`/api/vendas/financeiro?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Não foi possível carregar o financeiro");
        setContas(data.contas);
        setResumo(data.resumo);
        setTotal(data.total);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar financeiro"))
      .finally(() => setLoading(false));
  }, [empresaId, filialId, tipo, mes, ano, buscaCliente, dispositivoId, pagina, isNovaContaModalOpen, refreshKey]);

  async function handleAcaoFinanceira(conta: ContaFinanceira) {
    const acaoTexto = tipo === "receber" ? "recebimento" : "pagamento";
    if (!confirm(`Confirmar o ${acaoTexto} integral desta conta?`)) return;
    try {
      const res = await fetch(`/api/vendas/financeiro/${conta.id_conta_pagar_receber}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pagar", empresa_id: empresaId, valor: conta.valor }),
      });
      if (!res.ok) throw new Error(`Erro ao confirmar ${acaoTexto}`);
      setRefreshKey(r => r + 1);
    } catch (e: any) {
      alert(e.message);
    }
  }

  async function handleExcluir(id: string) {
    if (!confirm("Deseja realmente excluir esta conta?")) return;
    try {
      const res = await fetch(`/api/vendas/financeiro/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir conta");
      setRefreshKey(r => r + 1);
    } catch (e: any) {
      alert(e.message);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <section className="vendas-fin-section">
      {/* ── Topo: tabs + ação ── */}
      <div className="vendas-fin-topo">
        <div className="vendas-fin-tabs">
          <button
            type="button"
            className={`vendas-fin-tab${tipo === "receber" ? " vendas-fin-tab-ativa" : ""}`}
            onClick={() => setTipo("receber")}
          >
            A Receber
          </button>
          <button
            type="button"
            className={`vendas-fin-tab${tipo === "pagar" ? " vendas-fin-tab-ativa vendas-fin-tab-pagar" : ""}`}
            onClick={() => setTipo("pagar")}
          >
            A Pagar
          </button>
        </div>
        {tipo === "pagar" && (
          <button
            type="button"
            className="vendas-fin-nova-conta"
            onClick={() => setIsNovaContaModalOpen(true)}
          >
            + Nova Conta
          </button>
        )}
      </div>

      {/* ── Cards de resumo ── */}
      {resumo && (
        <div className="vendas-fin-cards">
          {tipo === "receber" ? (
            <>
              <div className="vendas-fin-card vendas-fin-card-amber">
                <span>Pendente</span>
                <strong>{formatarMoeda(resumo.pendente)}</strong>
              </div>
              <div className="vendas-fin-card vendas-fin-card-blue">
                <span>Pago Parcial</span>
                <strong>{formatarMoeda(resumo.pago_parcial)}</strong>
              </div>
              <div className="vendas-fin-card vendas-fin-card-red">
                <span>Vencidos</span>
                <strong>{formatarMoeda(resumo.vencidos)}</strong>
              </div>
              <div className="vendas-fin-card vendas-fin-card-green">
                <span>Recebidos</span>
                <strong>{formatarMoeda(resumo.pagos)}</strong>
              </div>
            </>
          ) : (
            <>
              <div className="vendas-fin-card vendas-fin-card-neutral">
                <span>Total do mês</span>
                <strong>{formatarMoeda(resumo.total)}</strong>
              </div>
              <div className="vendas-fin-card vendas-fin-card-green">
                <span>Pagas</span>
                <strong>{formatarMoeda(resumo.pagos)}</strong>
              </div>
              <div className="vendas-fin-card vendas-fin-card-red">
                <span>Pendentes</span>
                <strong>{formatarMoeda(resumo.pendente)}</strong>
              </div>
              <div className="vendas-fin-card vendas-fin-card-amber">
                <span>Vencidas</span>
                <strong>{formatarMoeda(resumo.vencidos)}</strong>
              </div>
            </>
          )}
          {tipo === "receber" && (
            <div className="vendas-fin-card vendas-fin-card-total">
              <span>Total</span>
              <strong>{formatarMoeda(resumo.total)}</strong>
            </div>
          )}
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="vendas-fin-filtros">
        <input
          type="text"
          className="vendas-fin-busca"
          placeholder="Buscar cliente..."
          value={buscaCliente}
          onChange={(e) => setBuscaCliente(e.target.value)}
        />
        <select
          className="vendas-select"
          value={mes}
          onChange={(e) => handleSetMes(Number(e.target.value))}
        >
          {MESES.map((nome, i) => (
            <option key={nome} value={i + 1}>{nome}</option>
          ))}
        </select>
        <select
          className="vendas-select"
          value={ano}
          onChange={(e) => handleSetAno(Number(e.target.value))}
        >
          {[ano - 1, ano, ano + 1].map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          className="vendas-select"
          value={dispositivoId}
          onChange={(e) => setFiltros({ ...filtros, dispositivo: e.target.value })}
        >
          <option value="">Todos os dispositivos</option>
          {dispositivos.map((d) => (
            <option key={d.id_dispositivo} value={d.id_dispositivo}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      {erro && <p className="vendas-erro">{erro}</p>}

      {/* ── Lista de contas ── */}
      <div className="vendas-fin-lista-wrap">
        <div className="vendas-fin-lista-col">
          <div className="vendas-fin-lista-header">
            <span>
              Contas {tipo === "receber" ? "a Receber" : "a Pagar"} ({total})
            </span>
          </div>

          {loading ? (
            <div className="vendas-fin-vazio">Carregando...</div>
          ) : contas.length === 0 ? (
            <div className="vendas-fin-vazio">
              Nenhuma conta {tipo === "receber" ? "a receber" : "a pagar"} no período.
            </div>
          ) : (
            <ul className="vendas-fin-lista">
              {contas.map((c) => {
                const st = statusConta(c);
                return (
                  <li key={c.id_conta_pagar_receber} className="vendas-fin-item">
                    <div className="vendas-fin-item-info">
                      <div className="vendas-fin-item-title">
                        <strong>{c.nome_cliente || c.documento || "Documento sem nome"}</strong>
                        <span className={`vendas-fin-tag ${
                          st === "Pago" ? "vendas-fin-tag-green"
                          : st === "Pago Parcial" ? "vendas-fin-tag-blue"
                          : st === "Vencida" ? "vendas-fin-tag-red"
                          : "vendas-fin-tag-amber"
                        }`}>{st}</span>
                      </div>
                      <div className="vendas-fin-item-meta">
                        {c.emissao && <span style={{ marginRight: "1rem" }}>Emissão: {new Date(c.emissao).toLocaleDateString("pt-BR")}</span>}
                        <span>Vence: {new Date(c.vencimento).toLocaleDateString("pt-BR")}</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <span className="vendas-fin-item-valor">{formatarMoeda(Number(c.valor))}</span>
                      {st !== "Pago" && (
                        <button type="button" className="vendas-btn-text-green" onClick={() => handleAcaoFinanceira(c)}>
                          {tipo === "receber" ? "Receber" : "Pagar"}
                        </button>
                      )}
                      <button type="button" className="vendas-btn-text-red" onClick={() => handleExcluir(c.id_conta_pagar_receber)}>Excluir</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {totalPaginas > 1 && (
            <div className="vendas-fin-paginacao">
              <button type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </button>
              <span>Página {pagina} de {totalPaginas}</span>
              <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>
      {isNovaContaModalOpen && (
        <NovaContaModal
          empresaId={empresaId}
          onClose={() => setIsNovaContaModalOpen(false)}
        />
      )}
    </section>
  );
}

function NovaContaModal({ empresaId, onClose }: { empresaId: string; onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [valor, setValor] = useState("");
  const [vencimento, setVencimento] = useState("");
  const [categoria, setCategoria] = useState("");
  const [observacao, setObservacao] = useState("");
  const [jaEstaPago, setJaEstaPago] = useState(false);
  const [repetirMes, setRepetirMes] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/vendas/financeiro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          descricao,
          valor: Number(valor.replace(",", ".")),
          vencimento,
          categoria,
          observacao,
          pago: jaEstaPago,
          repetir_mes: repetirMes
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Erro ao salvar conta");
      }
      onClose();
    } catch (error: any) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vendas-modal-overlay">
      <div className="vendas-modal-nova-conta">
        <h2>Nova Conta a Pagar</h2>
        <form onSubmit={handleSubmit}>
          <div className="vendas-form-group" style={{ marginBottom: "1rem" }}>
            <label>Descrição</label>
            <input
              type="text"
              required
              className="vendas-form-input"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          
          <div className="vendas-form-row">
            <div className="vendas-form-group">
              <label>Valor</label>
              <input
                type="number"
                step="0.01"
                required
                className="vendas-form-input"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
            <div className="vendas-form-group">
              <label>Vencimento</label>
              <input
                type="date"
                required
                className="vendas-form-input"
                value={vencimento}
                onChange={(e) => setVencimento(e.target.value)}
              />
            </div>
          </div>

          <div className="vendas-form-row">
            <div className="vendas-form-group" style={{ flex: 1 }}>
              <label>Categoria</label>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <select className="vendas-form-input" value={categoria} onChange={(e) => setCategoria(e.target.value)} style={{ flex: 1 }}>
                  <option value="">Sem categoria</option>
                  <option value="impostos">Impostos</option>
                  <option value="fornecedores">Fornecedores</option>
                  <option value="funcionarios">Funcionários</option>
                  <option value="outros">Outros</option>
                </select>
                <button type="button" className="vendas-btn-outline-brand" style={{ padding: "0 0.85rem", fontSize: "1.2rem" }}>+</button>
              </div>
            </div>
            <div className="vendas-form-group" style={{ flex: 1 }}>
              <label>Observação</label>
              <input
                type="text"
                className="vendas-form-input"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
              />
            </div>
          </div>

          <div className="vendas-form-check">
            <label>
              <input type="checkbox" checked={jaEstaPago} onChange={(e) => setJaEstaPago(e.target.checked)} />
              Já está pago
            </label>
          </div>
          <div className="vendas-form-check">
            <label>
              <input type="checkbox" checked={repetirMes} onChange={(e) => setRepetirMes(e.target.checked)} />
              Repetir todo mês (12x)
            </label>
          </div>

          <div className="vendas-modal-actions" style={{ display: "flex", gap: "1rem", justifyContent: "flex-start", marginTop: "1.5rem" }}>
            <button type="submit" className="vendas-btn-brand" disabled={loading} style={{ flex: 1 }}>
              {loading ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" className="vendas-btn-cancelar" onClick={onClose} disabled={loading} style={{ background: "transparent", color: "#666", fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


const TAMANHOS_ETIQUETA = [
  { id: "gondola_100x30", label: "Gôndola 100x30mm", larguraMm: 100, alturaMm: 30 },
  { id: "termica_50x30", label: "Térmica 50x30mm", larguraMm: 50, alturaMm: 30 },
  { id: "termica_80x40", label: "Térmica 80x40mm", larguraMm: 80, alturaMm: 40 },
];

function EtiquetasPanel({ empresaId, filialId }: { empresaId: string; filialId: string | null }) {
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [tamanhoId, setTamanhoId] = useState(TAMANHOS_ETIQUETA[0].id);
  const [copias, setCopias] = useState(1);
  const [somenteCodigoBarras, setSomenteCodigoBarras] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setErro(null);
    const qs = new URLSearchParams({ empresa_id: empresaId, por_pagina: "200" });
    if (filialId) qs.set("filial_id", filialId);
    if (busca) qs.set("busca", busca);

    fetch(`/api/vendas/estoque?${qs.toString()}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Não foi possível carregar os produtos");
        setProdutos(data.produtos);
      })
      .catch((err) => setErro(err instanceof Error ? err.message : "Erro ao carregar produtos"))
      .finally(() => setLoading(false));
  }, [empresaId, filialId, busca]);

  function alternarSelecao(id: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function imprimir() {
    const tamanho = TAMANHOS_ETIQUETA.find((t) => t.id === tamanhoId) ?? TAMANHOS_ETIQUETA[0];
    const escolhidos = produtos.filter((p) => selecionados.has(p.id_produto));
    const janela = window.open("", "_blank", "width=800,height=600");
    if (!janela) return;

    const etiquetasHtml = escolhidos
      .flatMap((p) =>
        Array.from({ length: copias }).map(
          () => `
        <div class="etiqueta">
          ${!somenteCodigoBarras ? `<div class="etiqueta-nome">${p.descricao}</div>` : ""}
          ${!somenteCodigoBarras ? `<div class="etiqueta-preco">${formatarMoeda(Number(p.preco_venda))}</div>` : ""}
          <div class="etiqueta-codigo">*${p.id_produto.slice(0, 12).toUpperCase()}*</div>
        </div>`
        )
      )
      .join("");

    janela.document.write(`
      <html>
        <head>
          <title>Etiquetas</title>
          <style>
            @page { margin: 5mm; }
            body { margin: 0; font-family: Arial, sans-serif; }
            .folha { display: flex; flex-wrap: wrap; gap: 2mm; }
            .etiqueta {
              width: ${tamanho.larguraMm}mm;
              height: ${tamanho.alturaMm}mm;
              border: 1px solid #ccc;
              padding: 1mm 2mm;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: center;
              align-items: center;
              text-align: center;
              overflow: hidden;
            }
            .etiqueta-nome { font-size: 10px; font-weight: bold; }
            .etiqueta-preco { font-size: 12px; font-weight: bold; }
            .etiqueta-codigo { font-family: "Libre Barcode 39", monospace; font-size: 16px; letter-spacing: 1px; }
          </style>
        </head>
        <body>
          <div class="folha">${etiquetasHtml}</div>
          <script>window.onload = () => window.print();</script>
        </body>
      </html>
    `);
    janela.document.close();
  }

  return (
    <section className="vendas-filtros" style={{ flexDirection: "column", alignItems: "stretch", gap: 12 }}>
      <h2 style={{ margin: 0 }}>Etiquetas</h2>
      {erro && <p className="vendas-erro">{erro}</p>}

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 320px", minWidth: 280 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <strong>Produtos ({produtos.length})</strong>
            <span>{selecionados.size} selecionado(s)</span>
          </div>
          <input
            type="text"
            placeholder="Buscar por nome..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ width: "100%", marginBottom: 8 }}
          />
          <div style={{ maxHeight: 400, overflowY: "auto", border: "1px solid #e2e4eb", borderRadius: 8 }}>
            {loading && <p style={{ padding: 12 }}>Carregando...</p>}
            {!loading &&
              produtos.map((p) => (
                <label
                  key={p.id_produto}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderBottom: "1px solid #f0f0f0",
                    cursor: "pointer",
                  }}
                >
                  <span>
                    <input
                      type="checkbox"
                      checked={selecionados.has(p.id_produto)}
                      onChange={() => alternarSelecao(p.id_produto)}
                    />{" "}
                    {p.descricao}
                  </span>
                  <span>{formatarMoeda(Number(p.preco_venda))}</span>
                </label>
              ))}
          </div>
        </div>

        <div style={{ flex: "1 1 260px", minWidth: 240 }}>
          <strong>Configuração</strong>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            <label>
              Tamanho
              <select
                value={tamanhoId}
                onChange={(e) => setTamanhoId(e.target.value)}
                style={{ display: "block", width: "100%" }}
              >
                {TAMANHOS_ETIQUETA.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cópias por produto
              <input
                type="number"
                min={1}
                value={copias}
                onChange={(e) => setCopias(Math.max(1, Number(e.target.value)))}
                style={{ display: "block", width: "100%" }}
              />
            </label>
            <label>
              <input
                type="checkbox"
                checked={somenteCodigoBarras}
                onChange={(e) => setSomenteCodigoBarras(e.target.checked)}
              />{" "}
              Só código de barras (etiqueta avulsa)
            </label>
            <button type="button" onClick={imprimir} disabled={selecionados.size === 0}>
              Imprimir ({selecionados.size * copias} etiqueta(s))
            </button>
          </div>
        </div>
      </div>
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
  const [aba, setAba] = useState<AbaPrincipal>("dashboard");
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
        {/* Logo Zaya compacto */}
        <div className="vendas-topbar-logo">
          <div className="vendas-topbar-logo-icon">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <text x="1" y="17" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="16" fill="white">Z</text>
              <text x="14" y="10" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="10" fill="#2196F3">+</text>
            </svg>
          </div>
          <span className="vendas-topbar-logo-name">Zaya Vendas</span>
        </div>

        {/* Empresa + CNPJ */}
        <div className="vendas-topbar-empresa">
          {empresa && (
            <>
              <strong>{empresa.nome}</strong>
              {empresa.cpf_cnpj && <span>— {empresa.cpf_cnpj}</span>}
            </>
          )}
        </div>

        <nav className="vendas-nav">
          {NAV_ITEMS.map((item) =>
            item.aba ? (
              <span
                key={item.label}
                className={`vendas-nav-item${aba === item.aba ? " vendas-nav-item-active" : ""}`}
                onClick={() => setAba(item.aba as AbaPrincipal)}
                style={{ cursor: "pointer" }}
              >
                {item.label}
              </span>
            ) : (
              <span key={item.label} className="vendas-nav-item" title="Em breve">
                {item.label}
              </span>
            )
          )}
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
            <div className="vendas-avatar" title={empresa.nome}>
              {empresa.nome.charAt(0).toUpperCase()}
            </div>
            <span>{usuario ? usuario.nome : empresa.nome}</span>
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

        {aba === "vendas" && empresa && (
          <VendasListaPanel empresaId={empresa.id} filialId={filialAtiva} filtros={filtros} />
        )}
        {aba === "caixa" && empresa && <CaixaPanel empresaId={empresa.id} filialId={filialAtiva} />}
        {aba === "estoque" && empresa && <EstoquePanel empresaId={empresa.id} filialId={filialAtiva} />}
        {aba === "financeiro" && empresa && <FinanceiroPanel empresaId={empresa.id} filialId={filialAtiva} filtros={filtros} setFiltros={setFiltros} dispositivos={resumo?.dispositivos || []} />}
        {aba === "etiquetas" && empresa && <EtiquetasPanel empresaId={empresa.id} filialId={filialAtiva} />}

        {aba === "dashboard" && (
        <>
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
            {loading ? (
              <span className="vendas-atualizar-spinner">
                <span className="vendas-spinner vendas-spinner-sm vendas-spinner-light" /> Atualizando...
              </span>
            ) : (
              "Atualizar"
            )}
          </button>

          {resumo?.ultima_sincronizacao && (
            <span className="vendas-ultima-sync-chip">
              Última atualização: <strong>{formatarRelativo(resumo.ultima_sincronizacao.quando)}</strong>
            </span>
          )}
        </section>

        {error && <p className="vendas-erro">{error}</p>}

        {!resumo && loading && (
          <div className="vendas-loading-inicial">
            <span className="vendas-spinner" />
            <span>Carregando dados de vendas...</span>
          </div>
        )}

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
            <section className={`vendas-stats${loading ? " vendas-stats-atualizando" : ""}`}>
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
                <strong className="vendas-card-value vendas-card-value-green">{formatarMoeda(resumo.resumo.margem_bruta)}</strong>
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
        </>
        )}
      </main>
    </div>
  );
}
