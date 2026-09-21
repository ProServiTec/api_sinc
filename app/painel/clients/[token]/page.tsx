"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import ModalPagamento from "../../components/ModalPagamento";
import "../clients.css";
import "../../painel.css";

interface Dispositivo {
  id: string;
  nome: string | null;
  codigo_dispositivo: string | null;
  ativo: boolean;
  ultimo_sync_at: string | null;
}

interface IdentificacaoFilial {
  razao_social: string | null;
  nome_fantasia: string | null;
  cpf_cnpj: string | null;
}

interface Licenca {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  created_at: string;
  dispositivos: Dispositivo[];
  identificacao: IdentificacaoFilial | null;
}

interface Titulo {
  id: string;
  tipo: string;
  descricao: string | null;
  vencimento: string;
  valor: number;
  saldo: number;
  status: string;
}

interface LicencaPlano {
  id: string;
  codigo: string;
  licenca_id: string;
  licenca_nome: string;
  valor: string;
  periodicidade: "mensal" | "anual";
  dia_fechamento: number;
  ativo: boolean;
  created_at: string;
}

interface Detalhe {
  cliente: {
    id: string;
    nome: string;
    razao_social: string | null;
    cpf_cnpj: string | null;
    ativo: boolean;
    created_at: string;
  };
  licencas_ativas: number;
  maquinas: number;
  ultima_sincronizacao: string | null;
  licencas: Licenca[];
  licencas_plano: LicencaPlano[];
  titulos: Titulo[];
}

interface LicencaCatalogo {
  id: string;
  nome: string;
  descricao: string | null;
  valor: string;
  periodicidade: "mensal" | "anual";
  dia_fechamento: number;
}

interface EmpresaSessao {
  id: string;
  nome: string;
  is_admin: boolean;
  is_master: boolean;
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function formatarMoeda(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DetalheCliente() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editando, setEditando] = useState(false);
  const [editNome, setEditNome] = useState("");
  const [editRazaoSocial, setEditRazaoSocial] = useState("");
  const [editCpfCnpj, setEditCpfCnpj] = useState("");
  const [salvandoEdicao, setSalvandoEdicao] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [revendaId, setRevendaId] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<LicencaCatalogo[]>([]);
  const [licencaSelecionada, setLicencaSelecionada] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [pedidoPix, setPedidoPix] = useState<{
    id: string;
    status: "pendente" | "pago" | "cancelado";
    checkout_url: string | null;
    valor: string;
  } | null>(null);
  const [verificandoPagamento, setVerificandoPagamento] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState<"pix" | "cartao">("pix");
  const [modalCompraAberto, setModalCompraAberto] = useState(false);

  const [atualizando, setAtualizando] = useState(false);
  const [atualizarMensagem, setAtualizarMensagem] = useState<string | null>(null);

  function carregarDetalhe(revenda: string) {
    return fetch(
      `/api/painel/clientes/${encodeURIComponent(params.token)}?revenda_id=${encodeURIComponent(revenda)}`
    )
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar o cliente");
        }
        setDetalhe(data as Detalhe);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar o cliente"))
      .finally(() => setLoading(false));
  }

  function carregarCatalogo(revenda: string) {
    return fetch(`/api/painel/licencas?revenda_id=${encodeURIComponent(revenda)}`)
      .then(async (response) => {
        const data = await response.json();
        if (response.ok) setCatalogo(data.catalogo as LicencaCatalogo[]);
      })
      .catch(() => {
        // Catálogo é um complemento da tela; falha aqui não deve bloquear os dados do cliente.
      });
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      const raw = sessionStorage.getItem("empresa");
      const empresa = raw ? (JSON.parse(raw) as EmpresaSessao) : null;
      if (!empresa) {
        setError("Sessão expirada. Faça login novamente.");
        setLoading(false);
        return;
      }
      setRevendaId(empresa.id);
      carregarDetalhe(empresa.id);
      carregarCatalogo(empresa.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  async function handleComprarLicenca() {
    if (!revendaId || !licencaSelecionada) return;

    setAdicionando(true);
    setAddError(null);

    try {
      const response = await fetch(`/api/painel/clientes/${encodeURIComponent(params.token)}/licencas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenda_id: revendaId, licenca_id: licencaSelecionada, metodo_pagamento: metodoPagamento }),
      });

      const data = await response.json();

      if (!response.ok) {
        setAddError(data.error ?? "Não foi possível gerar a cobrança PIX");
        return;
      }

      setPedidoPix(data.pedido);
      if (data.pedido.checkout_url) {
        window.open(data.pedido.checkout_url, "_blank", "noopener,noreferrer");
      }
    } catch {
      setAddError("Não foi possível conectar ao servidor");
    } finally {
      setAdicionando(false);
    }
  }

  async function verificarPagamentoPedido() {
    if (!revendaId || !pedidoPix) return;

    setVerificandoPagamento(true);
    try {
      const response = await fetch(
        `/api/painel/clientes/${encodeURIComponent(params.token)}/licencas/pedidos/${pedidoPix.id}?revenda_id=${encodeURIComponent(revendaId)}`
      );
      const data = await response.json();
      if (!response.ok) return;

      setPedidoPix(data.pedido);

      if (data.pedido.status === "pago") {
        setLicencaSelecionada("");
        await carregarDetalhe(revendaId);
      }
    } finally {
      setVerificandoPagamento(false);
    }
  }

  // Enquanto tem um pedido PIX pendente aberto, verifica automaticamente a
  // cada 5s se já foi pago (o backend confirma via webhook da InfinitePay ou
  // confirmação manual do Master — este polling só reflete esse status).
  useEffect(() => {
    if (!pedidoPix || pedidoPix.status !== "pendente") return;
    const intervalo = setInterval(verificarPagamentoPedido, 5000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoPix?.id, pedidoPix?.status]);

  async function handleRemoverLicenca(licencaPlanoId: string) {
    if (!revendaId) return;
    if (!confirm("Remover esta licença do cliente?")) return;

    try {
      const response = await fetch(
        `/api/painel/clientes/${encodeURIComponent(params.token)}/licencas/${licencaPlanoId}?revenda_id=${encodeURIComponent(revendaId)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Não foi possível remover a licença");
      }
      await carregarDetalhe(revendaId);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível remover a licença");
    }
  }

  async function handleAtualizar() {
    if (!revendaId) return;
    setAtualizando(true);
    setAtualizarMensagem(null);

    try {
      const response = await fetch(`/api/painel/clientes/${encodeURIComponent(params.token)}/atualizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenda_id: revendaId }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível solicitar a atualização");
      }

      setAtualizarMensagem(
        "Solicitado! O sincronizador vai atualizar os dados na próxima vez que verificar — pode levar alguns minutos."
      );
    } catch (err) {
      setAtualizarMensagem(err instanceof Error ? err.message : "Não foi possível solicitar a atualização");
    } finally {
      setAtualizando(false);
    }
  }

  function iniciarEdicao() {
    if (!detalhe) return;
    setEditNome(detalhe.cliente.nome);
    setEditRazaoSocial(detalhe.cliente.razao_social ?? "");
    setEditCpfCnpj(detalhe.cliente.cpf_cnpj ?? "");
    setEditError(null);
    setEditando(true);
  }

  async function salvarEdicao() {
    if (!revendaId) return;
    setSalvandoEdicao(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/painel/clientes/${encodeURIComponent(params.token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revenda_id: revendaId,
          nome: editNome,
          razao_social: editRazaoSocial,
          cpf_cnpj: editCpfCnpj,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível salvar as alterações");
      }

      setEditando(false);

      // O CPF/CNPJ mudou: o token da URL (que é o próprio documento
      // criptografado) ficou obsoleto — navega pro novo antes de recarregar.
      if (data.token !== params.token) {
        router.replace(`/painel/clients/${data.token}`);
        return;
      }

      setDetalhe((atual) => (atual ? { ...atual, cliente: { ...atual.cliente, ...data.cliente } } : atual));
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Não foi possível salvar as alterações");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  const planoSelecionado = catalogo.find((c) => c.id === licencaSelecionada) ?? null;

  return (
    <>
      <Link href="/painel/clients" className="clients-voltar">
        ← Voltar
      </Link>

      {loading && <p className="painel-loading">Carregando cliente...</p>}
      {error && <p className="painel-error">{error}</p>}

      {detalhe && (
        <>
          <header className="clients-detalhe-header">
            <h1>{detalhe.cliente.nome}</h1>
            <span className={detalhe.cliente.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
              {detalhe.cliente.ativo ? "Ativo" : "Inativo"}
            </span>
          </header>
          {detalhe.cliente.razao_social && <p className="clients-detalhe-sub">{detalhe.cliente.razao_social}</p>}
          {detalhe.cliente.cpf_cnpj && <p className="clients-detalhe-sub">{detalhe.cliente.cpf_cnpj}</p>}

          <section className="painel-stats">
            <div className="painel-card">
              <span className="painel-card-label">Licenças ativas</span>
              <strong className="painel-card-value painel-card-value-blue">{detalhe.licencas_ativas}</strong>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Máquinas</span>
              <strong className="painel-card-value">{detalhe.maquinas}</strong>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Cadastrado em</span>
              <strong className="painel-card-value">{formatarData(detalhe.cliente.created_at)}</strong>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Última sincronização</span>
              <strong className="painel-card-value">
                {detalhe.ultima_sincronizacao ? formatarDataHora(detalhe.ultima_sincronizacao) : "Nunca sincronizou"}
              </strong>
            </div>
          </section>

          <section className="clients-atualizar">
            <button className="clients-atualizar-btn" onClick={handleAtualizar} disabled={atualizando}>
              {atualizando ? "Solicitando..." : "Atualizar dados agora"}
            </button>
            {atualizarMensagem && <p className="clients-atualizar-mensagem">{atualizarMensagem}</p>}
          </section>

          <section className="clients-detalhe-card">
            <div className="clients-dados-header">
              <h2>Dados da Empresa</h2>
              {!editando && (
                <button type="button" className="clients-editar-btn" onClick={iniciarEdicao}>
                  Editar
                </button>
              )}
            </div>

            {editando ? (
              <div className="clients-dados-grid">
                <label className="clients-field">
                  CNPJ
                  <input type="text" value={editCpfCnpj} onChange={(e) => setEditCpfCnpj(e.target.value)} />
                </label>
                <label className="clients-field">
                  Razão social
                  <input
                    type="text"
                    value={editRazaoSocial}
                    onChange={(e) => setEditRazaoSocial(e.target.value)}
                  />
                </label>
                <label className="clients-field">
                  Nome fantasia
                  <input type="text" value={editNome} onChange={(e) => setEditNome(e.target.value)} />
                </label>

                {editError && <p className="clients-error">{editError}</p>}

                <div className="clients-dados-acoes">
                  <button type="button" className="clients-cadastrar-btn" onClick={salvarEdicao} disabled={salvandoEdicao}>
                    {salvandoEdicao ? "Salvando..." : "Salvar"}
                  </button>
                  <button type="button" onClick={() => setEditando(false)} disabled={salvandoEdicao}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="clients-dados-grid">
                <div>
                  <span className="clients-dados-label">CNPJ</span>
                  <strong>{detalhe.cliente.cpf_cnpj ?? "—"}</strong>
                </div>
                <div>
                  <span className="clients-dados-label">Razão social</span>
                  <strong>{detalhe.cliente.razao_social ?? "—"}</strong>
                </div>
                <div>
                  <span className="clients-dados-label">Nome fantasia</span>
                  <strong>{detalhe.cliente.nome}</strong>
                </div>
              </div>
            )}
          </section>

          <section className="clients-detalhe-card">
            <div className="clients-licencas-header">
              <h2>Licenças do Plano ({detalhe.licencas_plano.length})</h2>
              <div className="clients-licencas-plano-selecao">
                <select
                  className="clients-licencas-plano-select"
                  value={licencaSelecionada}
                  onChange={(e) => setLicencaSelecionada(e.target.value)}
                >
                  <option value="">Selecione um plano</option>
                  {catalogo.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome} — {formatarMoeda(c.valor)}
                    </option>
                  ))}
                </select>
                <button
                  className="clients-add-licenca-btn"
                  onClick={() => { setMetodoPagamento("pix"); setModalCompraAberto(true); }}
                  disabled={!licencaSelecionada || !!pedidoPix}
                >
                  {planoSelecionado
                    ? `+ Nova Licença (${formatarMoeda(planoSelecionado.valor)})`
                    : "+ Nova Licença"}
                </button>
              </div>
            </div>

            {addError && <p className="clients-error">{addError}</p>}
            {catalogo.length === 0 && (
              <p className="painel-vazio">Nenhum plano de licença disponível no momento.</p>
            )}

            {pedidoPix && pedidoPix.status === "pendente" && (
              <div className="clients-detalhe-card" style={{ marginBottom: "1rem" }}>
                <strong>Aguardando pagamento de {formatarMoeda(pedidoPix.valor)}...</strong>
                <p className="painel-card-hint">
                  A licença só é liberada pro cliente depois que o pagamento for confirmado.
                </p>
                <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}>
                  {pedidoPix.checkout_url && (
                    <a href={pedidoPix.checkout_url} target="_blank" rel="noreferrer" className="clients-cadastrar-btn">
                      Abrir cobrança
                    </a>
                  )}
                  <button onClick={verificarPagamentoPedido} disabled={verificandoPagamento}>
                    {verificandoPagamento ? "Verificando..." : "Já paguei — verificar agora"}
                  </button>
                  <button onClick={() => setPedidoPix(null)}>Cancelar</button>
                </div>
              </div>
            )}

            {modalCompraAberto && planoSelecionado && (
              <ModalPagamento
                resumo={
                  <>
                    {planoSelecionado.nome} · <strong>{formatarMoeda(planoSelecionado.valor)}</strong>
                  </>
                }
                valorFormatado={formatarMoeda(planoSelecionado.valor)}
                metodo={metodoPagamento}
                onMetodoChange={setMetodoPagamento}
                processando={adicionando}
                onConfirmar={async () => {
                  await handleComprarLicenca();
                  setModalCompraAberto(false);
                }}
                onFechar={() => setModalCompraAberto(false)}
              />
            )}

            {pedidoPix && pedidoPix.status === "pago" && (
              <p className="master-config-sucesso">Pagamento confirmado! Licença liberada pro cliente.</p>
            )}

            {detalhe.licencas_plano.length === 0 ? (
              <p className="painel-vazio">Nenhuma licença de plano atribuída a este cliente ainda.</p>
            ) : (
              <ul className="clients-licencas-lista">
                {detalhe.licencas_plano.map((l) => (
                  <li key={l.id} className="clients-licenca-item">
                    <div className="clients-licenca-topo">
                      <strong>{l.licenca_nome}</strong>
                      <span className={l.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
                        {l.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                    <div className="clients-licenca-meta">
                      <code className="licencas-codigo">{l.codigo}</code>
                      <span>{formatarMoeda(l.valor)}</span>
                      <span>{l.periodicidade === "mensal" ? "Mensal" : "Anual"}</span>
                      <span>Fecha dia {l.dia_fechamento}</span>
                      <span>Atribuída em {formatarData(l.created_at)}</span>
                    </div>
                    <button className="clients-licenca-remover-btn" onClick={() => handleRemoverLicenca(l.id)}>
                      Remover
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="clients-detalhe-card">
            <div className="clients-licencas-header">
              <h2>Licenças ({detalhe.licencas.length})</h2>
            </div>

            {detalhe.licencas.length === 0 ? (
              <p className="painel-vazio">Nenhuma licença (filial) cadastrada ainda.</p>
            ) : (
              <ul className="clients-licencas-lista">
                {detalhe.licencas.map((l) => (
                  <li key={l.id} className="clients-licenca-item">
                    <div className="clients-licenca-topo">
                      <strong>{l.nome}</strong>
                      <span className={l.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
                        {l.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </div>
                    {l.identificacao && (
                      <p className="clients-licenca-identificacao">
                        {[l.identificacao.razao_social, l.identificacao.nome_fantasia, l.identificacao.cpf_cnpj]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <div className="clients-licenca-meta">
                      {l.cpf_cnpj && <span>{l.cpf_cnpj}</span>}
                      {(l.cidade || l.uf) && (
                        <span>
                          {l.cidade}
                          {l.cidade && l.uf ? " - " : ""}
                          {l.uf}
                        </span>
                      )}
                      <span>Criada em {formatarData(l.created_at)}</span>
                    </div>

                    {l.dispositivos.length > 0 && (
                      <div className="clients-dispositivos">
                        {l.dispositivos.map((d) => (
                          <div key={d.id} className="clients-dispositivo-item">
                            <span className={d.ativo ? "clients-dot-ativo" : "clients-dot-inativo"} />
                            <span>{d.nome ?? `Dispositivo ${d.codigo_dispositivo ?? ""}`}</span>
                            {d.ultimo_sync_at && (
                              <span className="clients-dispositivo-sync">{formatarDataHora(d.ultimo_sync_at)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="clients-detalhe-card">
            <h2>Faturas ({detalhe.titulos.length})</h2>
            {detalhe.titulos.length === 0 ? (
              <p className="painel-vazio">Nenhuma fatura ainda.</p>
            ) : (
              <table className="clients-tabela">
                <thead>
                  <tr>
                    <th>Descrição</th>
                    <th>Vencimento</th>
                    <th>Valor</th>
                    <th>Saldo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detalhe.titulos.map((t) => (
                    <tr key={t.id}>
                      <td>{t.descricao ?? t.tipo}</td>
                      <td>{formatarData(t.vencimento)}</td>
                      <td>{formatarMoeda(t.valor)}</td>
                      <td>{formatarMoeda(t.saldo)}</td>
                      <td>{t.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

    </>
  );
}
