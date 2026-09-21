"use client";

import { useEffect, useState } from "react";
import "./faturas.css";

interface Licenca {
  id: string;
  nome: string;
  ativo: boolean;
  created_at: string;
  cliente_nome: string;
  codigo?: string;
  dispositivo_nome?: string;
  vence_em?: string;
  plano?: string;
  valor?: number;
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

function formatarMoeda(valor: number) {
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function StatusBadge({ ativo }: { ativo: boolean }) {
  return (
    <span className={`faturas-status-badge ${ativo ? "faturas-status-ativa" : "faturas-status-inativa"}`}>
      {ativo ? "Ativa" : "Revogada"}
    </span>
  );
}

export default function Faturas() {
  const [dados, setDados] = useState<Faturas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [plano, setPlano] = useState<"mensal" | "anual">("mensal");

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

  function toggleSelecionada(id: string) {
    setSelecionadas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function limparSelecao() {
    setSelecionadas(new Set());
  }

  // Quantidade que precisa renovar: não ativas (revogadas)
  const precisamRenovar = dados
    ? dados.licencas.filter((l) => !l.ativo).length
    : 0;

  return (
    <>
      <header className="painel-header faturas-page-header">
        <div>
          <h1>Faturas e Pagamentos</h1>
          <p>Gerencie pagamentos das suas licenças</p>
        </div>
        <div className="faturas-preco-info">
          <span>Mensal: <strong>R$ 11,99</strong>/licença</span>
          <span>Anual: <strong>R$ 115,10</strong>/licença <span className="faturas-desconto">20% off</span></span>
        </div>
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
            <div className="painel-card">
              <span className="painel-card-label">Precisam renovar</span>
              <strong className="painel-card-value faturas-valor-renovar">{precisamRenovar}</strong>
              <span className="painel-card-hint">vencidas + vence em 10d</span>
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
                <button
                  type="button"
                  className="faturas-acao-btn faturas-acao-btn-brand"
                  onClick={() => {
                    const precisam = dados.licencas.filter((l) => !l.ativo).map((l) => l.id);
                    // se não tiver nenhuma que precise, seleciona todas para facilitar testes
                    if (precisam.length === 0) {
                      setSelecionadas(new Set(dados.licencas.map(l => l.id)));
                    } else {
                      setSelecionadas(new Set(precisam));
                    }
                  }}
                >
                  Selecionar tudo que precisa renovar
                </button>
                <button
                  type="button"
                  className="faturas-acao-btn"
                  onClick={limparSelecao}
                >
                  Limpar
                </button>
                <select 
                  className="faturas-select" 
                  value={plano} 
                  onChange={(e) => setPlano(e.target.value as "mensal" | "anual")}
                >
                  <option value="mensal">Mensal — R$ 11,99/licença</option>
                  <option value="anual">Anual — R$ 115,10/licença</option>
                </select>
              </div>
            </div>

            {dados.licencas.length === 0 ? (
              <p className="painel-vazio">Nenhuma licença.</p>
            ) : (
              <ul className="faturas-lista">
                {dados.licencas.map((l) => (
                  <li key={l.id} className={`faturas-item ${selecionadas.has(l.id) ? "faturas-item-selecionada" : ""}`}>
                    <input
                      type="checkbox"
                      className="faturas-checkbox"
                      checked={selecionadas.has(l.id)}
                      onChange={() => toggleSelecionada(l.id)}
                    />
                    <div className="faturas-item-info" onClick={() => toggleSelecionada(l.id)} style={{ cursor: "pointer", flex: 1 }}>
                      <div className="faturas-item-topo">
                        <span className="faturas-item-cliente-nome">{l.cliente_nome}</span>
                        <StatusBadge ativo={l.ativo} />
                      </div>
                      <div className="faturas-item-meta">
                        {l.codigo && <span className="faturas-codigo">{l.codigo}</span>}
                        {l.dispositivo_nome && <span>{l.dispositivo_nome}</span>}
                        <span>
                          {l.vence_em
                            ? `Vence: ${formatarData(l.vence_em)}`
                            : `Criada: ${formatarData(l.created_at)}`}
                        </span>
                        <span style={{ fontWeight: 600, color: 'var(--cor-marca)' }}>{plano === "anual" ? "Anual" : "Mensal"}</span>
                      </div>
                    </div>
                    <div className="faturas-item-valor">
                      <span className="faturas-valor-principal">
                        {formatarMoeda(plano === "anual" ? 115.10 : 11.99)}
                      </span>
                      <span className="faturas-valor-periodo">/{plano === "anual" ? "ano" : "mês"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {selecionadas.size > 0 && (
              <div className="faturas-checkout-bar" style={{
                marginTop: 24, padding: 24, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div>
                  <span style={{ display: 'block', fontSize: '0.9rem', color: '#64748b' }}>
                    {selecionadas.size} licença(s) selecionada(s)
                  </span>
                  <strong style={{ fontSize: '1.5rem', color: '#0f172a' }}>
                    Total: {formatarMoeda(selecionadas.size * (plano === "anual" ? 115.10 : 11.99))}
                  </strong>
                </div>
                <button 
                  type="button" 
                  className="faturas-acao-btn faturas-acao-btn-brand"
                  style={{ padding: '12px 32px', fontSize: '1.1rem', background: 'var(--cor-marca)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}
                  onClick={() => {
                    const total = formatarMoeda(selecionadas.size * (plano === "anual" ? 115.10 : 11.99));
                    alert(`Redirecionando para pagamento via InfinitePay...\n\nPlano: ${plano.toUpperCase()}\nLicenças: ${selecionadas.size}\nTotal: ${total}`);
                    limparSelecao();
                  }}
                >
                  Renovar e Pagar
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
