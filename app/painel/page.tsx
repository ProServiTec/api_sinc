"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "./clients/clients.css";

interface Resumo {
  empresa: { id: string; nome: string };
  clientes: { total: number; ativos: number };
  licencas: { total: number; ativas: number };
  dispositivos: { total: number; ativos: number };
  titulos: {
    vencidos_count: number;
    vencidos_valor: string;
    pendentes_count: number;
    pendentes_valor: string;
  };
  clientes_recentes: {
    id: string;
    nome: string;
    razao_social: string | null;
    cpf_cnpj: string | null;
    ativo: boolean;
    licencas: number;
    dispositivos: number;
    fatura_status: "vencida" | "pendente" | "em_dia" | null;
    token: string | null;
  }[];
}

function FaturaBadge({ status }: { status: "vencida" | "pendente" | "em_dia" | null }) {
  if (!status) return <span className="clients-fatura-badge clients-fatura-sem">—</span>;
  const config = {
    vencida: { label: "Vencida", className: "clients-fatura-vencida" },
    pendente: { label: "Pendente", className: "clients-fatura-pendente" },
    em_dia: { label: "Em dia", className: "clients-fatura-em-dia" },
  }[status];
  return <span className={`clients-fatura-badge ${config.className}`}>{config.label}</span>;
}

function formatarMoeda(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export default function Painel() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("empresa");
    if (!raw) return;
    const empresa = JSON.parse(raw) as { id: string };

    fetch(`/api/painel?empresa_id=${encodeURIComponent(empresa.id)}`)
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
        <h1>Visão Geral</h1>
        <p>{resumo ? `Bem-vindo, ${resumo.empresa.nome}` : "Carregando..."}</p>
      </header>

      {loading && <p className="painel-loading">Carregando dados...</p>}
      {error && <p className="painel-error">{error}</p>}

      {resumo && (
        <>
          <section className="painel-stats">
            <Link href="/painel/clients" className="painel-card painel-card-link">
              <span className="painel-card-label">Clientes</span>
              <strong className="painel-card-value">{resumo.clientes.total}</strong>
              <span className="painel-card-hint">{resumo.clientes.ativos} ativos</span>
            </Link>

            <Link href="/painel/licencas" className="painel-card painel-card-link">
              <span className="painel-card-label">Licenças ativas</span>
              <strong className="painel-card-value painel-card-value-blue">{resumo.licencas.ativas}</strong>
              <span className="painel-card-hint">{resumo.licencas.total} no total</span>
            </Link>

            <div className="painel-card">
              <span className="painel-card-label">Máquinas conectadas</span>
              <strong className="painel-card-value">{resumo.dispositivos.total}</strong>
              <span className="painel-card-hint">{resumo.dispositivos.ativos} ativas</span>
            </div>

            <Link href="/painel/faturas" className="painel-card painel-card-link">
              <span className="painel-card-label">Faturas em aberto</span>
              <strong className="painel-card-value">
                {formatarMoeda(Number(resumo.titulos.vencidos_valor) + Number(resumo.titulos.pendentes_valor))}
              </strong>
              <span className="painel-card-hint">
                {resumo.titulos.vencidos_count + resumo.titulos.pendentes_count} título(s)
              </span>
            </Link>
          </section>

          {resumo.titulos.vencidos_count > 0 && (
            <section className="painel-alerta painel-alerta-vencida">
              <div>
                <strong>Faturas vencidas</strong>
                <p>
                  {resumo.titulos.vencidos_count} fatura(s) vencida(s), totalizando{" "}
                  {formatarMoeda(resumo.titulos.vencidos_valor)}.
                </p>
              </div>
            </section>
          )}

          {resumo.titulos.pendentes_count > 0 && (
            <section className="painel-alerta painel-alerta-pendente">
              <div>
                <strong>Pagamentos pendentes</strong>
                <p>
                  {resumo.titulos.pendentes_count} fatura(s) a vencer, totalizando{" "}
                  {formatarMoeda(resumo.titulos.pendentes_valor)}.
                </p>
              </div>
            </section>
          )}

          <section className="painel-clientes">
            <div className="painel-clientes-header">
              <h2>Clientes recentes</h2>
            </div>

            {resumo.clientes_recentes.length === 0 ? (
              <p className="painel-vazio">Nenhum cliente cadastrado ainda.</p>
            ) : (
              <ul className="painel-clientes-lista">
                {resumo.clientes_recentes.map((cliente) => {
                  const conteudo = (
                    <>
                      <div>
                        <strong>{cliente.nome}</strong>
                        {cliente.cpf_cnpj && <span className="painel-cliente-doc">{cliente.cpf_cnpj}</span>}
                      </div>
                      <div className="painel-cliente-meta">
                        <span>{cliente.licencas} licença(s)</span>
                        <span>{cliente.dispositivos} máquina(s)</span>
                        <FaturaBadge status={cliente.fatura_status} />
                        <span className={cliente.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
                          {cliente.ativo ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </>
                  );
                  return cliente.token ? (
                    <Link
                      key={cliente.id}
                      href={`/painel/clients/${cliente.token}`}
                      className="painel-cliente-item painel-cliente-item-link"
                    >
                      {conteudo}
                    </Link>
                  ) : (
                    <li key={cliente.id} className="painel-cliente-item">
                      {conteudo}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
