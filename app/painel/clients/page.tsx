"use client";

import { SubmitEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "./clients.css";

interface Cliente {
  id: string;
  nome: string;
  razao_social: string | null;
  cpf_cnpj: string | null;
  ativo: boolean;
  licencas: number;
  licencas_ativas: number;
  dispositivos: number;
  token: string | null;
}

interface Resumo {
  clientes: { total: number; ativos: number; inativos: number };
  licencas_ativas: number;
  maquinas: number;
}

interface EmpresaSessao {
  id: string;
  nome: string;
  is_admin: boolean;
  is_master: boolean;
}

export default function PainelClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [revendaId, setRevendaId] = useState<string | null>(null);

  function carregar(revenda: string) {
    setLoading(true);
    setError(null);
    fetch(`/api/painel/clientes?revenda_id=${encodeURIComponent(revenda)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar os clientes");
        }
        setResumo(data.resumo as Resumo);
        setClientes(data.clientes as Cliente[]);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar os clientes"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    // Adia para o próximo microtask: lê sessionStorage só depois de montar
    // (evita hydration mismatch) e então carrega os clientes da revenda logada.
    Promise.resolve().then(() => {
      const raw = sessionStorage.getItem("empresa");
      const empresa = raw ? (JSON.parse(raw) as EmpresaSessao) : null;
      if (!empresa) {
        setError("Sessão expirada. Faça login novamente.");
        setLoading(false);
        return;
      }
      setRevendaId(empresa.id);
      carregar(empresa.id);
    });
  }, []);

  const clientesFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return clientes;
    return clientes.filter(
      (c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.razao_social ?? "").toLowerCase().includes(termo) ||
        (c.cpf_cnpj ?? "").toLowerCase().includes(termo)
    );
  }, [clientes, busca]);

  return (
    <>
      <header className="painel-header clients-header">
        <div>
          <h1>Meus Clientes</h1>
          <p>Gerencie seus clientes e licenças</p>
        </div>
        <button className="clients-novo-btn" onClick={() => setModalAberto(true)}>
          + Novo Cliente
        </button>
      </header>

      {loading && <p className="painel-loading">Carregando clientes...</p>}
      {error && <p className="painel-error">{error}</p>}

      {resumo && (
        <section className="painel-stats">
          <div className="painel-card">
            <span className="painel-card-label">Clientes</span>
            <strong className="painel-card-value">{resumo.clientes.total}</strong>
          </div>
          <div className="painel-card">
            <span className="painel-card-label">Licenças ativas</span>
            <strong className="painel-card-value painel-card-value-blue">{resumo.licencas_ativas}</strong>
          </div>
          <div className="painel-card">
            <span className="painel-card-label">Máquinas conectadas</span>
            <strong className="painel-card-value">{resumo.maquinas}</strong>
          </div>
          <div className="painel-card">
            <span className="painel-card-label">Inativos</span>
            <strong className="painel-card-value painel-card-value-muted">{resumo.clientes.inativos}</strong>
          </div>
        </section>
      )}

      <div className="clients-busca">
        <input
          type="text"
          placeholder="Buscar por nome ou CNPJ..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      <div className="clients-tabela-wrap">
        {clientesFiltrados.length === 0 && !loading ? (
          <p className="painel-vazio">Nenhum cliente cadastrado ainda.</p>
        ) : (
          <table className="clients-tabela">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>CNPJ</th>
                <th>Licenças</th>
                <th>Máquinas</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {clientesFiltrados.map((c) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.nome}</strong>
                    {c.razao_social && <span className="clients-razao">{c.razao_social}</span>}
                  </td>
                  <td>{c.cpf_cnpj ?? "—"}</td>
                  <td>
                    {c.licencas_ativas}/{c.licencas}
                  </td>
                  <td>{c.dispositivos}</td>
                  <td>
                    <span className={c.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    {c.token && (
                      <Link href={`/painel/clients/${c.token}`} className="clients-ver-detalhes">
                        Ver detalhes
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalAberto && revendaId && (
        <NovoClienteModal
          revendaId={revendaId}
          onFechar={() => setModalAberto(false)}
          onCriado={() => {
            setModalAberto(false);
            carregar(revendaId);
          }}
        />
      )}
    </>
  );
}

function NovoClienteModal({
  revendaId,
  onFechar,
  onCriado,
}: {
  revendaId: string;
  onFechar: () => void;
  onCriado: () => void;
}) {
  const [nome, setNome] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, razao_social: razaoSocial, cpf_cnpj: cpfCnpj, senha, revenda_id: revendaId }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível cadastrar o cliente");
        return;
      }

      onCriado();
    } catch {
      setError("Não foi possível conectar ao servidor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="clients-modal-backdrop" onClick={onFechar}>
      <form
        className="clients-modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="clients-modal-header">
          <h2>Novo Cliente</h2>
          <button type="button" className="clients-modal-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <label className="clients-field">
          Nome
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>

        <label className="clients-field">
          Razão social
          <input type="text" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} required />
        </label>

        <label className="clients-field">
          CPF/CNPJ
          <input type="text" value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} required />
        </label>

        <label className="clients-field">
          Senha
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="Mínimo de 6 caracteres"
            autoComplete="new-password"
            minLength={6}
            required
          />
        </label>

        {error && <p className="clients-error">{error}</p>}

        <button type="submit" className="clients-cadastrar-btn" disabled={loading}>
          {loading ? "Cadastrando..." : "Cadastrar"}
        </button>
      </form>
    </div>
  );
}
