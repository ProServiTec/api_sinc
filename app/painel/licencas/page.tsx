"use client";

import { SubmitEvent, useEffect, useState } from "react";
import "../painel.css";
import "../clients/clients.css";

interface EmpresaSessao {
  id: string;
  nome: string;
  is_admin: boolean;
  is_master: boolean;
}

interface LicencaCatalogo {
  id: string;
  nome: string;
  descricao: string | null;
  valor: string;
  periodicidade: "mensal" | "anual";
  dia_fechamento: number;
}

interface MinhaLicenca {
  id: string;
  licenca_id: string;
  licenca_nome: string;
  valor: string;
  periodicidade: "mensal" | "anual";
  dia_fechamento: number;
  empresa_id: string | null;
  empresa_nome: string | null;
  ativo: boolean;
  created_at: string;
}

function formatarMoeda(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function PainelLicencas() {
  const [revendaId, setRevendaId] = useState<string | null>(null);
  const [catalogo, setCatalogo] = useState<LicencaCatalogo[]>([]);
  const [minhas, setMinhas] = useState<MinhaLicenca[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [licencaComprando, setLicencaComprando] = useState<LicencaCatalogo | null>(null);

  function carregar(revenda: string) {
    setLoading(true);
    setError(null);
    fetch(`/api/painel/licencas?revenda_id=${encodeURIComponent(revenda)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar as licenças");
        }
        setCatalogo(data.catalogo as LicencaCatalogo[]);
        setMinhas(data.minhas as MinhaLicenca[]);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar as licenças"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.resolve().then(() => {
      const raw = sessionStorage.getItem("empresa");
      const empresa = raw ? (JSON.parse(raw) as EmpresaSessao) : null;
      if (!empresa) {
        setLoading(false);
        return;
      }
      setRevendaId(empresa.id);
      carregar(empresa.id);
    });
  }, []);

  return (
    <>
      <header className="painel-header">
        <h1>Licenças</h1>
        <p>Compre licenças do catálogo para revender aos seus clientes</p>
      </header>

      {loading && <p className="painel-loading">Carregando...</p>}
      {error && <p className="painel-error">{error}</p>}

      {!loading && !error && (
        <>
          <div className="licencas-catalogo">
            {catalogo.length === 0 ? (
              <p className="painel-vazio">Nenhuma licença disponível no catálogo no momento.</p>
            ) : (
              catalogo.map((l) => (
                <div key={l.id} className="licencas-catalogo-card">
                  <h3>{l.nome}</h3>
                  {l.descricao && <span className="licencas-catalogo-meta">{l.descricao}</span>}
                  <span className="licencas-catalogo-valor">{formatarMoeda(l.valor)}</span>
                  <span className="licencas-catalogo-meta">
                    {l.periodicidade === "mensal" ? "Mensal" : "Anual"} · fecha dia {l.dia_fechamento}
                  </span>
                  <button className="licencas-comprar-btn" onClick={() => setLicencaComprando(l)}>
                    Comprar
                  </button>
                </div>
              ))
            )}
          </div>

          <h2 className="licencas-secao-titulo">Minhas Licenças</h2>
          <div className="clients-tabela-wrap">
            {minhas.length === 0 ? (
              <p className="painel-vazio">Você ainda não comprou nenhuma licença.</p>
            ) : (
              <table className="clients-tabela">
                <thead>
                  <tr>
                    <th>Licença</th>
                    <th>Valor</th>
                    <th>Periodicidade</th>
                    <th>Status</th>
                    <th>Comprada em</th>
                  </tr>
                </thead>
                <tbody>
                  {minhas.map((m) => (
                    <tr key={m.id}>
                      <td>
                        <strong>{m.licenca_nome}</strong>
                      </td>
                      <td>{formatarMoeda(m.valor)}</td>
                      <td>{m.periodicidade === "mensal" ? "Mensal" : "Anual"}</td>
                      <td>
                        {m.empresa_id ? (
                          <span className="painel-status-atribuida">Atribuída a {m.empresa_nome}</span>
                        ) : (
                          <span className="painel-status-estoque">Em estoque</span>
                        )}
                      </td>
                      <td>{formatarData(m.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {licencaComprando && revendaId && (
        <ComprarLicencaModal
          licenca={licencaComprando}
          revendaId={revendaId}
          onFechar={() => setLicencaComprando(null)}
          onComprado={() => {
            setLicencaComprando(null);
            carregar(revendaId);
          }}
        />
      )}
    </>
  );
}

function ComprarLicencaModal({
  licenca,
  revendaId,
  onFechar,
  onComprado,
}: {
  licenca: LicencaCatalogo;
  revendaId: string;
  onFechar: () => void;
  onComprado: () => void;
}) {
  const [quantidade, setQuantidade] = useState("1");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/painel/licencas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revenda_id: revendaId,
          licenca_id: licenca.id,
          quantidade: Number(quantidade),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Não foi possível concluir a compra");
        return;
      }

      onComprado();
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
          <h2>Comprar {licenca.nome}</h2>
          <button type="button" className="clients-modal-fechar" onClick={onFechar} aria-label="Fechar">
            ×
          </button>
        </div>

        <p className="licencas-catalogo-meta">
          {formatarMoeda(licenca.valor)} · {licenca.periodicidade === "mensal" ? "Mensal" : "Anual"}
        </p>

        <label className="clients-field">
          Quantidade
          <input
            type="number"
            min="1"
            max="100"
            value={quantidade}
            onChange={(e) => setQuantidade(e.target.value)}
            required
          />
        </label>

        {error && <p className="clients-error">{error}</p>}

        <button type="submit" className="clients-cadastrar-btn" disabled={loading}>
          {loading ? "Comprando..." : "Confirmar compra"}
        </button>
      </form>
    </div>
  );
}
