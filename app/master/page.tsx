"use client";

import { useEffect, useState } from "react";
import "./master.css";

interface Resumo {
  revendas: { total: number; ativas: number };
  clientes: { total: number; ativos: number };
  licencas: { total: number; ativas: number };
  dispositivos: { total: number; ativos: number };
  vendas: { total: number; valor_total: number };
  titulos: {
    vencidos_count: number;
    vencidos_valor: string;
    pendentes_count: number;
    pendentes_valor: string;
  };
}

function formatarMoeda(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function MasterVisaoGeral() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/master/resumo")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar o painel");
        }
        setResumo(data as Resumo);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar o painel"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <header className="painel-header">
        <h1>Visão Geral da Plataforma</h1>
        <p>Uso, parceiros e finanças de todo o sistema</p>
      </header>

      {loading && <p className="painel-loading">Carregando dados...</p>}
      {error && <p className="painel-error">{error}</p>}

      {resumo && (
        <>
          <section className="painel-stats">
            <div className="painel-card">
              <span className="painel-card-label">Parceiros</span>
              <strong className="painel-card-value">{resumo.revendas.total}</strong>
              <span className="painel-card-hint">{resumo.revendas.ativas} ativas</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Clientes</span>
              <strong className="painel-card-value painel-card-value-blue">{resumo.clientes.total}</strong>
              <span className="painel-card-hint">{resumo.clientes.ativos} ativos</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Licenças</span>
              <strong className="painel-card-value">{resumo.licencas.ativas}</strong>
              <span className="painel-card-hint">{resumo.licencas.total} no total</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Máquinas conectadas</span>
              <strong className="painel-card-value">{resumo.dispositivos.total}</strong>
              <span className="painel-card-hint">{resumo.dispositivos.ativos} ativas</span>
            </div>
          </section>

          <section className="master-secao">
            <h2>Uso da plataforma</h2>
            <div className="master-uso-grid">
              <div>
                <span className="master-dados-label">Vendas registradas (todas as empresas)</span>
                <strong>{resumo.vendas.total}</strong>
              </div>
              <div>
                <span className="master-dados-label">Valor total transacionado</span>
                <strong>{formatarMoeda(resumo.vendas.valor_total)}</strong>
              </div>
            </div>
          </section>

          <section className="master-secao">
            <h2>Finanças do site</h2>
            <div className="master-uso-grid">
              <div>
                <span className="master-dados-label">Faturas vencidas</span>
                <strong className="master-valor-vencido">
                  {resumo.titulos.vencidos_count} · {formatarMoeda(resumo.titulos.vencidos_valor)}
                </strong>
              </div>
              <div>
                <span className="master-dados-label">Faturas pendentes</span>
                <strong className="master-valor-pendente">
                  {resumo.titulos.pendentes_count} · {formatarMoeda(resumo.titulos.pendentes_valor)}
                </strong>
              </div>
              <div>
                <span className="master-dados-label">Total em aberto</span>
                <strong>
                  {formatarMoeda(Number(resumo.titulos.vencidos_valor) + Number(resumo.titulos.pendentes_valor))}
                </strong>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
}
