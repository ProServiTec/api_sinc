"use client";

import { SubmitEvent, useEffect, useState } from "react";
import Link from "next/link";
import "../../painel/clients/clients.css";
import "../master.css";

interface Revenda {
  id: string;
  nome: string;
  razao_social: string | null;
  cpf_cnpj: string | null;
  ativo: boolean;
  created_at: string;
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function MasterRevendas() {
  const [revendas, setRevendas] = useState<Revenda[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);

  function carregar() {
    setLoading(true);
    setError(null);
    fetch("/api/master/revendas")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar os parceiros");
        }
        setRevendas(data.revendas as Revenda[]);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar os parceiros"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.resolve().then(carregar);
  }, []);

  return (
    <>
      <header className="painel-header clients-header">
        <div>
          <h1>Parceiros</h1>
          <p>Empresas que gerenciam clientes e licenças (Portal Parceiros)</p>
        </div>
        <button className="clients-novo-btn" onClick={() => setModalAberto(true)}>
          + Novo Parceiro
        </button>
      </header>

      {loading && <p className="painel-loading">Carregando parceiros...</p>}
      {error && <p className="painel-error">{error}</p>}

      <div className="clients-tabela-wrap">
        {revendas.length === 0 && !loading ? (
          <p className="painel-vazio">Nenhum parceiro cadastrado ainda.</p>
        ) : (
          <table className="clients-tabela">
            <thead>
              <tr>
                <th>Parceiro</th>
                <th>CNPJ</th>
                <th>Cadastrada em</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {revendas.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.nome}</strong>
                    {r.razao_social && <span className="clients-razao">{r.razao_social}</span>}
                  </td>
                  <td>{r.cpf_cnpj ?? "—"}</td>
                  <td>{formatarData(r.created_at)}</td>
                  <td>
                    <span className={r.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
                      {r.ativo ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td>
                    <Link href={`/master/revendas/${r.id}`} className="clients-ver-detalhes">
                      Ver detalhes
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalAberto && (
        <NovaRevendaModal
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

function NovaRevendaModal({ onFechar, onCriado }: { onFechar: () => void; onCriado: () => void }) {
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
      const response = await fetch("/api/master/revendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, razao_social: razaoSocial, cpf_cnpj: cpfCnpj, senha }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível cadastrar o parceiro");
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
      <form className="clients-modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <div className="clients-modal-header">
          <h2>Novo Parceiro</h2>
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
