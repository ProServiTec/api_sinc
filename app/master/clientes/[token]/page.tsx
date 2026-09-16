"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import "../../../painel/clients/clients.css";

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

interface Titulo {
  id: string;
  tipo: string;
  descricao: string | null;
  vencimento: string;
  valor: number;
  saldo: number;
  status: string;
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
  titulos: Titulo[];
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatarDataHora(iso: string) {
  return new Date(iso).toLocaleString("pt-BR");
}

function formatarMoeda(valor: number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DetalheEmpresaMaster() {
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

  useEffect(() => {
    fetch(`/api/master/empresas/${encodeURIComponent(params.token)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar a empresa");
        }
        setDetalhe(data as Detalhe);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar a empresa"))
      .finally(() => setLoading(false));
  }, [params.token]);

  function iniciarEdicao() {
    if (!detalhe) return;
    setEditNome(detalhe.cliente.nome);
    setEditRazaoSocial(detalhe.cliente.razao_social ?? "");
    setEditCpfCnpj(detalhe.cliente.cpf_cnpj ?? "");
    setEditError(null);
    setEditando(true);
  }

  async function salvarEdicao() {
    setSalvandoEdicao(true);
    setEditError(null);

    try {
      const response = await fetch(`/api/master/empresas/${encodeURIComponent(params.token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: editNome, razao_social: editRazaoSocial, cpf_cnpj: editCpfCnpj }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível salvar as alterações");
      }

      setEditando(false);

      if (data.token !== params.token) {
        router.replace(`/master/clientes/${data.token}`);
        return;
      }

      setDetalhe((atual) => (atual ? { ...atual, cliente: { ...atual.cliente, ...data.cliente } } : atual));
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Não foi possível salvar as alterações");
    } finally {
      setSalvandoEdicao(false);
    }
  }

  return (
    <>
      <Link href="/master/clientes" className="clients-voltar">
        ← Voltar
      </Link>

      {loading && <p className="painel-loading">Carregando empresa...</p>}
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
              <h2>Licenças ({detalhe.licencas.length})</h2>
              <button className="clients-add-licenca-btn" title="Em breve">
                + Adicionar Licença <span className="clients-add-licenca-valor">R$ 11,99/mês</span>
              </button>
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
