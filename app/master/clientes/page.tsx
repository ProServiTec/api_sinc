"use client";

import { SubmitEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import "../../painel/clients/clients.css";

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

export default function MasterClientes() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);

  function carregar() {
    setLoading(true);
    setError(null);
    fetch("/api/master/empresas")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar as empresas");
        }
        setResumo(data.resumo as Resumo);
        setClientes(data.clientes as Cliente[]);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar as empresas"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.resolve().then(carregar);
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
          <h1>Empresas</h1>
          <p>Gerencie as empresas clientes e licenças da plataforma</p>
        </div>
        <button className="clients-novo-btn" onClick={() => setModalAberto(true)}>
          + Nova Empresa
        </button>
      </header>

      {loading && <p className="painel-loading">Carregando empresas...</p>}
      {error && <p className="painel-error">{error}</p>}

      {resumo && (
        <section className="painel-stats">
          <div className="painel-card">
            <span className="painel-card-label">Empresas</span>
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
          <p className="painel-vazio">Nenhuma empresa cadastrada ainda.</p>
        ) : (
          <table className="clients-tabela">
            <thead>
              <tr>
                <th>Empresa</th>
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
                      <Link href={`/master/clientes/${c.token}`} className="clients-ver-detalhes">
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

      {modalAberto && (
        <NovaEmpresaModal
          onFechar={() => setModalAberto(false)}
          onCriado={() => {
            setModalAberto(false);
            carregar();
          }}
        />
      )}
    </>
  );
}

function NovaEmpresaModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
  const [nome, setNome] = useState("");
  const [razaoSocial, setRazaoSocial] = useState("");
  const [cpfCnpj, setCpfCnpj] = useState("");
  const [limiteUsuarios, setLimiteUsuarios] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credencial, setCredencial] = useState<{ cpfCnpj: string; senha: string } | null>(null);
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

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          razao_social: razaoSocial,
          cpf_cnpj: cpfCnpj,
          limite_usuarios: limiteUsuarios.trim() === "" ? null : Number(limiteUsuarios),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível cadastrar a empresa");
        return;
      }

      setCredencial({ cpfCnpj, senha: data.senha_master as string });
    } catch {
      setError("Não foi possível conectar ao servidor");
    } finally {
      setLoading(false);
    }
  }

  if (credencial) {
    return (
      <div className="clients-modal-backdrop">
        <div className="clients-modal-card">
          <div className="clients-modal-header">
            <h2>Empresa cadastrada!</h2>
          </div>

          <p>
            Repasse esta credencial de <strong>Usuário Master</strong> ao cliente. Ela só é exibida
            agora — se for perdida, será preciso gerar uma nova senha.
          </p>

          <label className="clients-field">
            CPF/CNPJ
            <input type="text" value={credencial.cpfCnpj} readOnly />
          </label>

          <label className="clients-field">
            Senha
            <div style={{ display: "flex", gap: 8 }}>
              <input type="text" value={credencial.senha} readOnly style={{ flex: 1 }} />
              <button type="button" onClick={() => copiarSenha(credencial.senha)}>
                {senhaCopiada ? "Copiado!" : "Copiar"}
              </button>
            </div>
          </label>

          <button type="button" className="clients-cadastrar-btn" onClick={() => onCriado()}>
            Concluir
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="clients-modal-backdrop" onClick={onFechar}>
      <form
        className="clients-modal-card"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <div className="clients-modal-header">
          <h2>Nova Empresa</h2>
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
          Limite de subusuários (opcional)
          <input
            type="number"
            min={0}
            value={limiteUsuarios}
            onChange={(e) => setLimiteUsuarios(e.target.value)}
            placeholder="Sem limite"
          />
        </label>

        <p className="clients-field-hint">
          A senha do Usuário Master é gerada automaticamente e exibida no próximo passo.
        </p>

        {error && <p className="clients-error">{error}</p>}

        <button type="submit" className="clients-cadastrar-btn" disabled={loading}>
          {loading ? "Cadastrando..." : "Cadastrar"}
        </button>
      </form>
    </div>
  );
}
