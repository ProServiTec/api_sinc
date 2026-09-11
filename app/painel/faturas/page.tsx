"use client";

import { useEffect, useState } from "react";
import "./faturas.css";

interface Licenca {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
  cliente_nome: string;
}

interface Faturas {
  licencas_resumo: { total: number; ativas: number };
  titulos: {
    vencidos_count: number;
    vencidos_valor: string;
    pendentes_count: number;
    pendentes_valor: string;
  };
  licencas: Licenca[];
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export default function Faturas() {
  const [dados, setDados] = useState<Faturas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("empresa");
    if (!raw) return;
    const empresa = JSON.parse(raw) as { id: string };

    fetch(`/api/painel/faturas?empresa_id=${encodeURIComponent(empresa.id)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar as faturas");
        }
        setDados(data as Faturas);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar as faturas"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="painel-header">
        <h1>Faturas e Pagamentos</h1>
        <p>Gerencie pagamentos das suas licenças</p>
      </header>

      {loading && <p className="painel-loading">Carregando...</p>}
      {error && <p className="painel-error">{error}</p>}

      {dados && (
        <>
          <section className="painel-stats faturas-stats">
            <div className="painel-card">
              <span className="painel-card-label">Ativas</span>
              <strong className="painel-card-value faturas-valor-ativas">{dados.licencas_resumo.ativas}</strong>
              <span className="painel-card-hint">R$ 0,00/mês</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Pendentes</span>
              <strong className="painel-card-value faturas-valor-pendentes">
                {dados.titulos.pendentes_count}
              </strong>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Vencidas</span>
              <strong className="painel-card-value faturas-valor-vencidas">{dados.titulos.vencidos_count}</strong>
            </div>
            <div className="painel-card faturas-card-total">
              <span className="painel-card-label">Total</span>
              <strong className="painel-card-value">{dados.licencas_resumo.total}</strong>
            </div>
          </section>

          <section className="faturas-licencas">
            <div className="faturas-licencas-header">
              <h2>Licenças ({dados.licencas.length})</h2>
              <div className="faturas-acoes">
                <span className="faturas-acao" title="Em breve">
                  Selecionar pendentes
                </span>
                <span className="faturas-acao faturas-acao-azul" title="Em breve">
                  Selecionar p/ renovar
                </span>
                <span className="faturas-acao" title="Em breve">
                  Limpar
                </span>
                <select className="faturas-select" disabled title="Em breve">
                  <option>Mensal — R$ 0,00/licença</option>
                </select>
              </div>
            </div>

            {dados.licencas.length === 0 ? (
              <p className="painel-vazio">Nenhuma licença.</p>
            ) : (
              <ul className="faturas-lista">
                {dados.licencas.map((l) => (
                  <li key={l.id} className="faturas-item">
                    <div>
                      <strong>{l.nome}</strong>
                      <span className="faturas-item-cliente">{l.cliente_nome}</span>
                    </div>
                    <div className="faturas-item-meta">
                      <span>Criada em {formatarData(l.created_at)}</span>
                      <span className={l.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
                        {l.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </div>
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
