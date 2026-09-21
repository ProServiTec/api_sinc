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
  const [modalAberto, setModalAberto] = useState(false);

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
              <div style={{
                marginTop: 24, padding: '20px 24px', background: '#f8fafc',
                borderRadius: 12, border: '1px solid #e2e8f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <span style={{ display: 'block', fontSize: '0.9rem', color: '#64748b' }}>
                    {selecionadas.size} licença(s) selecionada(s)
                  </span>
                  <strong style={{ fontSize: '1.4rem', color: '#0f172a' }}>
                    Total: {formatarMoeda(selecionadas.size * precoPlano)}
                  </strong>
                </div>
                <button
                  type="button"
                  onClick={() => { setMetodoPagamento("pix"); setModalAberto(true); }}
                  style={{
                    padding: '12px 28px', fontSize: '1rem',
                    background: 'var(--brand)', color: '#fff',
                    border: 'none', borderRadius: 8,
                    cursor: 'pointer', fontWeight: 700,
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  Renovar e Pagar →
                </button>
              </div>
            )}

            {/* Modal de pagamento */}
            {modalAberto && (
              <div
                onClick={() => !processandoPagamento && setModalAberto(false)}
                style={{
                  position: 'fixed', inset: 0, zIndex: 1000,
                  background: 'rgba(15,23,42,0.55)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(2px)',
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#fff', borderRadius: 16, padding: '32px 28px',
                    width: '100%', maxWidth: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
                    display: 'flex', flexDirection: 'column', gap: 0,
                  }}
                >
                  {/* Cabeçalho */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                        Escolha como pagar
                      </h2>
                      <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.9rem' }}>
                        {selecionadas.size} licença(s) · Total: <strong style={{ color: '#0f172a' }}>{formatarMoeda(selecionadas.size * precoPlano)}</strong>
                      </p>
                    </div>
                    <button
                      onClick={() => setModalAberto(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.4rem', color: '#94a3b8', lineHeight: 1 }}
                    >×</button>
                  </div>

                  {/* Opção PIX */}
                  <div
                    onClick={() => setMetodoPagamento("pix")}
                    style={{
                      border: metodoPagamento === "pix" ? '2px solid var(--brand)' : '2px solid #e2e8f0',
                      borderRadius: 12, padding: '16px 20px', cursor: 'pointer',
                      marginBottom: 12, background: metodoPagamento === "pix" ? 'rgba(var(--brand-rgb, 59,130,246),0.05)' : '#fff',
                      transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 16,
                    }}
                  >
                    <span style={{ fontSize: '2rem', lineHeight: 1 }}>⚡</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', color: '#0f172a', fontSize: '1rem' }}>PIX</strong>
                      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        Aprovação imediata · QR Code gerado pela InfinitePay
                      </span>
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      border: metodoPagamento === "pix" ? '6px solid var(--brand)' : '2px solid #cbd5e1',
                      flexShrink: 0, transition: 'all 0.15s',
                    }} />
                  </div>

                  {/* Opção Cartão */}
                  <div
                    onClick={() => setMetodoPagamento("cartao")}
                    style={{
                      border: metodoPagamento === "cartao" ? '2px solid var(--brand)' : '2px solid #e2e8f0',
                      borderRadius: 12, padding: '16px 20px', cursor: 'pointer',
                      marginBottom: 24, background: metodoPagamento === "cartao" ? 'rgba(var(--brand-rgb, 59,130,246),0.05)' : '#fff',
                      transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 16,
                    }}
                  >
                    <span style={{ fontSize: '2rem', lineHeight: 1 }}>💳</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ display: 'block', color: '#0f172a', fontSize: '1rem' }}>Cartão de Crédito</strong>
                      <span style={{ color: '#64748b', fontSize: '0.85rem' }}>
                        Parcelamento disponível · Processado pela InfinitePay
                      </span>
                    </div>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      border: metodoPagamento === "cartao" ? '6px solid var(--brand)' : '2px solid #cbd5e1',
                      flexShrink: 0, transition: 'all 0.15s',
                    }} />
                  </div>

                  {/* Botões de ação */}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={() => setModalAberto(false)}
                      disabled={processandoPagamento}
                      style={{
                        flex: 1, padding: '12px', borderRadius: 8, border: '2px solid #e2e8f0',
                        background: '#fff', color: '#374151', fontWeight: 600, cursor: 'pointer', fontSize: '0.95rem',
                      }}
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={async () => { await handlePagarLote(); setModalAberto(false); }}
                      disabled={processandoPagamento}
                      style={{
                        flex: 2, padding: '12px', borderRadius: 8, border: 'none',
                        background: 'var(--brand)', color: '#fff', fontWeight: 700,
                        cursor: processandoPagamento ? 'not-allowed' : 'pointer',
                        fontSize: '0.95rem', opacity: processandoPagamento ? 0.7 : 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      {processandoPagamento ? (
                        'Gerando cobrança...'
                      ) : (
                        <>
                          {metodoPagamento === "pix" ? "⚡" : "💳"}
                          {' '}Confirmar — {formatarMoeda(selecionadas.size * precoPlano)}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
