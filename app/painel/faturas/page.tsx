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
  plano_nome?: string;
  valor?: number;
}

interface Plano {
  id: string;
  nome: string;
  valor: string;
  periodicidade: string;
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
  planos: Plano[];
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

function isPrecisandoRenovar(l: Licenca) {
  if (!l.ativo) return true;
  if (!l.vence_em) return false;
  const dias = Math.ceil((new Date(l.vence_em).getTime() - new Date().getTime()) / 86400000);
  return dias <= 10;
}

export default function Faturas() {
  const [dados, setDados] = useState<Faturas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [planoId, setPlanoId] = useState<string>("");
  const [processandoPagamento, setProcessandoPagamento] = useState(false);
  const [metodoPagamento, setMetodoPagamento] = useState<"pix" | "cartao">("pix");

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
        if (data.planos && data.planos.length > 0) {
          setPlanoId(data.planos[0].id);
        }
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

  async function handlePagarLote() {
    if (selecionadas.size === 0 || !planoId) return;
    
    const raw = sessionStorage.getItem("empresa");
    if (!raw) return;
    const empresa = JSON.parse(raw) as { id: string };

    setProcessandoPagamento(true);
    setError(null);

    try {
      const response = await fetch("/api/painel/faturas/pagar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          revenda_id: empresa.id,
          plano_id: planoId,
          filiais_ids: Array.from(selecionadas),
          metodo_pagamento: metodoPagamento,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível processar o pagamento");
      }

      limparSelecao();
      if (data.checkout_url) {
        window.open(data.checkout_url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Erro ao processar pagamento");
    } finally {
      setProcessandoPagamento(false);
    }
  }

  const precisamRenovar = dados
    ? dados.licencas.filter(isPrecisandoRenovar).length
    : 0;

  const planoSelecionado = dados?.planos.find(p => p.id === planoId);
  const precoPlano = planoSelecionado ? Number(planoSelecionado.valor) : 0;
  const isAnual = planoSelecionado?.periodicidade === "anual";

  return (
    <>
      <header className="painel-header faturas-page-header">
        <div>
          <h1>Faturas e Pagamentos</h1>
          <p>Gerencie pagamentos das suas licenças</p>
        </div>
        <div className="faturas-preco-info">
          {dados?.planos.map(p => (
            <span key={p.id}>{p.nome}: <strong>{formatarMoeda(Number(p.valor))}</strong>/{p.periodicidade}</span>
          ))}
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
                    const precisam = dados.licencas.filter(isPrecisandoRenovar).map((l) => l.id);
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
                {dados.planos.length > 0 && (
                  <select 
                    className="faturas-select" 
                    value={planoId} 
                    onChange={(e) => setPlanoId(e.target.value)}
                  >
                    {dados.planos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.nome} — {formatarMoeda(Number(p.valor))}/{p.periodicidade}
                      </option>
                    ))}
                  </select>
                )}
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
                        
                        {selecionadas.has(l.id) ? (() => {
                          const dt = l.vence_em ? new Date(l.vence_em) : new Date();
                          if (dt < new Date()) {
                            dt.setTime(new Date().getTime());
                          }
                          if (isAnual) dt.setFullYear(dt.getFullYear() + 1);
                          else dt.setMonth(dt.getMonth() + 1);
                          
                          const dias = Math.ceil((dt.getTime() - new Date().getTime()) / 86400000);
                          return (
                            <span style={{ color: 'var(--green)', fontWeight: 500 }}>
                              ➔ Vai até {formatarData(dt.toISOString())} (+{dias} dias)
                            </span>
                          );
                        })() : (
                          <span style={{ fontWeight: 600, color: 'var(--brand)' }}>{l.plano_nome ?? "Sem plano"}</span>
                        )}
                      </div>
                    </div>
                    <div className="faturas-item-valor">
                      <span className="faturas-valor-principal">
                        {formatarMoeda(precoPlano)}
                      </span>
                      <span className="faturas-valor-periodo">/{planoSelecionado?.periodicidade === "anual" ? "ano" : "mês"}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {selecionadas.size > 0 && (
              <div className="faturas-checkout-bar" style={{
                marginTop: 24, padding: 24, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0',
              }}>
                {/* Linha do total */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div>
                    <span style={{ display: 'block', fontSize: '0.9rem', color: '#64748b' }}>
                      {selecionadas.size} licença(s) selecionada(s)
                    </span>
                    <strong style={{ fontSize: '1.5rem', color: '#0f172a' }}>
                      Total: {formatarMoeda(selecionadas.size * precoPlano)}
                    </strong>
                  </div>
                </div>

                {/* Seleção de método */}
                <div style={{ marginBottom: 16 }}>
                  <span style={{ fontSize: '0.85rem', color: '#64748b', display: 'block', marginBottom: 8, fontWeight: 600 }}>
                    Como deseja pagar?
                  </span>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setMetodoPagamento("pix")}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 8,
                        border: metodoPagamento === "pix" ? '2px solid var(--brand)' : '2px solid #e2e8f0',
                        background: metodoPagamento === "pix" ? 'var(--brand)' : '#fff',
                        color: metodoPagamento === "pix" ? '#fff' : '#374151',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: '1.2rem' }}>⚡</span> PIX
                    </button>
                    <button
                      type="button"
                      onClick={() => setMetodoPagamento("cartao")}
                      style={{
                        padding: '10px 20px',
                        borderRadius: 8,
                        border: metodoPagamento === "cartao" ? '2px solid var(--brand)' : '2px solid #e2e8f0',
                        background: metodoPagamento === "cartao" ? 'var(--brand)' : '#fff',
                        color: metodoPagamento === "cartao" ? '#fff' : '#374151',
                        fontWeight: 600,
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        transition: 'all 0.15s',
                      }}
                    >
                      <span style={{ fontSize: '1.2rem' }}>💳</span> Cartão de Crédito
                    </button>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 8, marginBottom: 0 }}>
                    {metodoPagamento === "pix"
                      ? "Aprovação imediata. O QR Code será gerado pela InfinitePay."
                      : "Parcelamento disponível. A cobrança será processada pela InfinitePay."}
                  </p>
                </div>

                {/* Botão de confirmar */}
                <button
                  type="button"
                  className="faturas-acao-btn"
                  style={{
                    padding: '12px 32px', fontSize: '1.1rem',
                    background: 'var(--brand)', color: '#fff',
                    border: 'none', borderRadius: 8,
                    cursor: processandoPagamento ? 'not-allowed' : 'pointer',
                    fontWeight: 600, opacity: processandoPagamento ? 0.7 : 1,
                    width: '100%',
                  }}
                  disabled={processandoPagamento}
                  onClick={handlePagarLote}
                >
                  {processandoPagamento
                    ? "Gerando cobrança..."
                    : metodoPagamento === "pix"
                      ? `⚡ Renovar e Pagar com PIX — ${formatarMoeda(selecionadas.size * precoPlano)}`
                      : `💳 Renovar e Pagar com Cartão — ${formatarMoeda(selecionadas.size * precoPlano)}`}
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
