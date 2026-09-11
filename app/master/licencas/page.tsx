"use client";

import { SubmitEvent, useEffect, useState } from "react";
import "../../painel/clients/clients.css";
import "../master.css";

interface Licenca {
  id: string;
  nome: string;
  descricao: string | null;
  valor: string;
  periodicidade: "mensal" | "anual";
  dia_fechamento: number;
  ativo: boolean;
  created_at: string;
}

function formatarMoeda(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MasterLicencas() {
  const [licencas, setLicencas] = useState<Licenca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalAberto, setModalAberto] = useState(false);
  const [licencaEditando, setLicencaEditando] = useState<Licenca | null>(null);

  function carregar() {
    setLoading(true);
    setError(null);
    fetch("/api/master/licencas")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar as licenças");
        }
        setLicencas(data.licencas as Licenca[]);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar as licenças"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.resolve().then(carregar);
  }, []);

  async function excluir(licenca: Licenca) {
    if (!confirm(`Apagar a licença "${licenca.nome}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      const response = await fetch(`/api/master/licencas/${licenca.id}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Não foi possível apagar a licença");
      }
      carregar();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível apagar a licença");
    }
  }

  return (
    <>
      <header className="painel-header clients-header">
        <div>
          <h1>Licenças</h1>
          <p>Planos de licença oferecidos na plataforma</p>
        </div>
        <button
          className="clients-novo-btn"
          onClick={() => {
            setLicencaEditando(null);
            setModalAberto(true);
          }}
        >
          + Nova Licença
        </button>
      </header>

      {loading && <p className="painel-loading">Carregando licenças...</p>}
      {error && <p className="painel-error">{error}</p>}

      <div className="clients-tabela-wrap">
        {licencas.length === 0 && !loading ? (
          <p className="painel-vazio">Nenhuma licença cadastrada ainda.</p>
        ) : (
          <table className="clients-tabela">
            <thead>
              <tr>
                <th>Licença</th>
                <th>Valor</th>
                <th>Periodicidade</th>
                <th>Dia de fechamento</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {licencas.map((l) => (
                <tr key={l.id}>
                  <td>
                    <strong>{l.nome}</strong>
                    {l.descricao && <span className="clients-razao">{l.descricao}</span>}
                  </td>
                  <td>{formatarMoeda(l.valor)}</td>
                  <td>{l.periodicidade === "mensal" ? "Mensal" : "Anual"}</td>
                  <td>Dia {l.dia_fechamento}</td>
                  <td>
                    <span className={l.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
                      {l.ativo ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td className="licencas-acoes">
                    <button
                      className="licencas-acao-btn"
                      onClick={() => {
                        setLicencaEditando(l);
                        setModalAberto(true);
                      }}
                    >
                      Editar
                    </button>
                    <button className="licencas-acao-btn licencas-acao-apagar" onClick={() => excluir(l)}>
                      Apagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modalAberto && (
        <LicencaModal
          licenca={licencaEditando}
          onFechar={() => setModalAberto(false)}
          onSalvo={() => {
            setModalAberto(false);
            carregar();
          }}
        />
      )}
    </>
  );
}

function LicencaModal({
  licenca,
  onFechar,
  onSalvo,
}: {
  licenca: Licenca | null;
  onFechar: () => void;
  onSalvo: () => void;
}) {
  const [nome, setNome] = useState(licenca?.nome ?? "");
  const [descricao, setDescricao] = useState(licenca?.descricao ?? "");
  const [valor, setValor] = useState(licenca?.valor ?? "");
  const [periodicidade, setPeriodicidade] = useState<"mensal" | "anual">(licenca?.periodicidade ?? "mensal");
  const [diaFechamento, setDiaFechamento] = useState(String(licenca?.dia_fechamento ?? 1));
  const [ativo, setAtivo] = useState(licenca?.ativo ?? true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editando = licenca !== null;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(editando ? `/api/master/licencas/${licenca.id}` : "/api/master/licencas", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          descricao,
          valor: Number(valor),
          periodicidade,
          dia_fechamento: Number(diaFechamento),
          ...(editando ? { ativo } : {}),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível salvar a licença");
        return;
      }

      onSalvo();
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
          <h2>{editando ? "Editar Licença" : "Nova Licença"}</h2>
          <button type="button" className="clients-modal-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <label className="clients-field">
          Nome
          <input type="text" value={nome} onChange={(e) => setNome(e.target.value)} required />
        </label>

        <label className="clients-field">
          Descrição
          <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>

        <label className="clients-field">
          Valor (R$)
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
          />
        </label>

        <label className="clients-field">
          Periodicidade
          <select value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value as "mensal" | "anual")}>
            <option value="mensal">Mensal</option>
            <option value="anual">Anual</option>
          </select>
        </label>

        <label className="clients-field">
          Dia de fechamento (renovação)
          <input
            type="number"
            min="1"
            max="31"
            value={diaFechamento}
            onChange={(e) => setDiaFechamento(e.target.value)}
            required
          />
        </label>

        {editando && (
          <label className="clients-field licencas-campo-ativo">
            <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
            Licença ativa
          </label>
        )}

        {error && <p className="clients-error">{error}</p>}

        <button type="submit" className="clients-cadastrar-btn" disabled={loading}>
          {loading ? "Salvando..." : editando ? "Salvar alterações" : "Cadastrar"}
        </button>
      </form>
    </div>
  );
}
