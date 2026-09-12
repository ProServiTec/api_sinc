"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import "../clients.css";
import "../../painel.css";

interface Dispositivo {
  id: string;
  nome: string | null;
  codigo_dispositivo: string | null;
  ativo: boolean;
  ultimo_sync_at: string | null;
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
}

interface EstoqueItem {
  licenca_id: string;
  nome: string;
  valor: string;
  periodicidade: "mensal" | "anual";
  disponiveis: number;
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
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [revendaId, setRevendaId] = useState<string | null>(null);
  const [estoque, setEstoque] = useState<EstoqueItem[]>([]);
  const [licencaSelecionada, setLicencaSelecionada] = useState("");
  const [adicionando, setAdicionando] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

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

  function carregarEstoque(revenda: string) {
    return fetch(`/api/painel/licencas/estoque?revenda_id=${encodeURIComponent(revenda)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar o estoque de licenças");
        }
        setEstoque(data.estoque as EstoqueItem[]);
      })
      .catch(() => {
        // Estoque é um complemento da tela; falha aqui não deve bloquear os dados do cliente.
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
      carregarEstoque(empresa.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.token]);

  async function handleAdicionarLicenca() {
    if (!revendaId || !licencaSelecionada) return;

    setAdicionando(true);
    setAddError(null);

    try {
      const response = await fetch(`/api/painel/clientes/${encodeURIComponent(params.token)}/licencas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revenda_id: revendaId, licenca_id: licencaSelecionada }),
      });

      const data = await response.json();

      if (!response.ok) {
        setAddError(data.error ?? "Não foi possível adicionar a licença");
        return;
      }

      setLicencaSelecionada("");
      await Promise.all([carregarDetalhe(revendaId), carregarEstoque(revendaId)]);
    } catch {
      setAddError("Não foi possível conectar ao servidor");
    } finally {
      setAdicionando(false);
    }
  }

  async function handleRemoverLicenca(licencaPlanoId: string) {
    if (!revendaId) return;
    if (!confirm("Remover esta licença do cliente? Ela volta para o seu estoque.")) return;

    try {
      const response = await fetch(
        `/api/painel/clientes/${encodeURIComponent(params.token)}/licencas/${licencaPlanoId}?revenda_id=${encodeURIComponent(revendaId)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Não foi possível remover a licença");
      }
      await Promise.all([carregarDetalhe(revendaId), carregarEstoque(revendaId)]);
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
            <h2>Dados da Empresa</h2>
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
                  <option value="">Selecione uma licença em estoque</option>
                  {estoque.map((e) => (
                    <option key={e.licenca_id} value={e.licenca_id}>
                      {e.nome} ({e.disponiveis} disponíve{e.disponiveis === 1 ? "l" : "is"})
                    </option>
                  ))}
                </select>
                <button
                  className="clients-add-licenca-btn"
                  onClick={handleAdicionarLicenca}
                  disabled={!licencaSelecionada || adicionando}
                >
                  {adicionando ? "Adicionando..." : "+ Adicionar Licença"}
                </button>
              </div>
            </div>

            {addError && <p className="clients-error">{addError}</p>}
            {estoque.length === 0 && (
              <p className="painel-vazio">
                Você não tem licenças em estoque. Compre em{" "}
                <Link href="/painel/licencas">Licenças</Link>.
              </p>
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
        </>
      )}
    </>
  );
}
