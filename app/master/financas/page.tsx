"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import "../../painel/clients/clients.css";
import "../master.css";

interface EmpresaFinanceiro {
  id: string;
  nome: string;
  vencidos_count: number;
  vencidos_valor: string;
  pendentes_count: number;
  pendentes_valor: string;
  pagos_count: number;
  pagos_valor: string;
}

interface Titulo {
  id: string;
  empresa_nome: string;
  descricao: string;
  valor: string;
  saldo: string;
  vencimento: string | null;
  status_pagamento: "pago" | "pendente" | "atrasado";
}

interface LicencaComprada {
  id: string;
  codigo: string;
  revenda_id: string;
  revenda_nome: string;
  licenca_nome: string;
  valor: string;
  periodicidade: "mensal" | "anual";
  empresa_id: string | null;
  empresa_nome: string | null;
  ativo: boolean;
  created_at: string;
  status: "ativa" | "atrasada" | "cancelada";
}

interface PedidoPendente {
  id: string;
  valor: string;
  status: "pendente" | "pago" | "cancelado";
  checkout_url: string | null;
  created_at: string;
  revenda_nome: string;
  empresa_nome: string;
  licenca_nome: string;
}

interface Financas {
  totais: {
    vencidos_count: number;
    vencidos_valor: string;
    pendentes_count: number;
    pendentes_valor: string;
    pagos_count: number;
    pagos_valor: string;
  };
  por_empresa: EmpresaFinanceiro[];
  titulos: Titulo[];
  licencas_compradas: LicencaComprada[];
  pedidos_pendentes: PedidoPendente[];
}

function formatarMoeda(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

const STATUS_LABEL: Record<Titulo["status_pagamento"], string> = {
  pago: "Pago",
  pendente: "Pendente",
  atrasado: "Atrasado",
};

const LICENCA_STATUS_LABEL: Record<LicencaComprada["status"], string> = {
  ativa: "Ativa",
  atrasada: "Atrasada",
  cancelada: "Cancelada",
};

const LICENCA_STATUS_CLASS: Record<LicencaComprada["status"], string> = {
  ativa: "master-status-pago",
  atrasada: "master-status-atrasado",
  cancelada: "master-status-cancelada",
};

export default function MasterFinancas() {
  const [dados, setDados] = useState<Financas | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<string | null>(null);

  function carregar() {
    return fetch("/api/master/financas")
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar as finanças");
        }
        setDados(data as Financas);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar as finanças"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleConfirmarPagamento(pedidoId: string) {
    if (!confirm("Confirmar que este pagamento PIX foi recebido? Isso vai criar a licença pro cliente.")) return;

    setConfirmando(pedidoId);
    try {
      const response = await fetch(`/api/master/pedidos-licenca/${pedidoId}/confirmar`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível confirmar o pagamento");
      }
      await carregar();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Não foi possível confirmar o pagamento");
    } finally {
      setConfirmando(null);
    }
  }

  return (
    <>
      <header className="painel-header">
        <h1>Finanças do site</h1>
        <p>Contas a pagar/receber de todas as empresas da plataforma</p>
      </header>

      {loading && <p className="painel-loading">Carregando...</p>}
      {error && <p className="painel-error">{error}</p>}

      {dados && (
        <>
          <section className="painel-stats">
            <div className="painel-card">
              <span className="painel-card-label">Faturas vencidas</span>
              <strong className="painel-card-value master-valor-vencido">{dados.totais.vencidos_count}</strong>
              <span className="painel-card-hint">{formatarMoeda(dados.totais.vencidos_valor)}</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Faturas pendentes</span>
              <strong className="painel-card-value master-valor-pendente">{dados.totais.pendentes_count}</strong>
              <span className="painel-card-hint">{formatarMoeda(dados.totais.pendentes_valor)}</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Faturas pagas</span>
              <strong className="painel-card-value master-status-pago">{dados.totais.pagos_count}</strong>
              <span className="painel-card-hint">{formatarMoeda(dados.totais.pagos_valor)}</span>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Total em aberto</span>
              <strong className="painel-card-value painel-card-value-blue">
                {formatarMoeda(Number(dados.totais.vencidos_valor) + Number(dados.totais.pendentes_valor))}
              </strong>
            </div>
          </section>

          <section className="master-financas-titulos">
            <h2>Pedidos de licença aguardando pagamento PIX ({dados.pedidos_pendentes.length})</h2>
            <div className="clients-tabela-wrap">
              {dados.pedidos_pendentes.length === 0 ? (
                <p className="painel-vazio">Nenhum pedido pendente no momento.</p>
              ) : (
                <table className="clients-tabela">
                  <thead>
                    <tr>
                      <th>Revendedor</th>
                      <th>Cliente</th>
                      <th>Licença</th>
                      <th>Valor</th>
                      <th>Criado em</th>
                      <th>Link de pagamento</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.pedidos_pendentes.map((p) => (
                      <tr key={p.id}>
                        <td>{p.revenda_nome}</td>
                        <td>{p.empresa_nome}</td>
                        <td>{p.licenca_nome}</td>
                        <td>{formatarMoeda(p.valor)}</td>
                        <td>{new Date(p.created_at).toLocaleString("pt-BR")}</td>
                        <td>
                          {p.checkout_url ? (
                            <a href={p.checkout_url} target="_blank" rel="noreferrer" className="clients-ver-detalhes">
                              Abrir checkout
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          <button
                            className="clients-cadastrar-btn"
                            onClick={() => handleConfirmarPagamento(p.id)}
                            disabled={confirmando === p.id}
                          >
                            {confirmando === p.id ? "Confirmando..." : "Confirmar pagamento"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="clients-tabela-wrap master-financas-tabela">
            {dados.por_empresa.length === 0 ? (
              <p className="painel-vazio">Nenhuma fatura cadastrada em nenhuma empresa.</p>
            ) : (
              <table className="clients-tabela">
                <thead>
                  <tr>
                    <th>Empresa</th>
                    <th>Vencidas</th>
                    <th>Pendentes</th>
                    <th>Pagas</th>
                    <th>Total em aberto</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.por_empresa.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <strong>{e.nome}</strong>
                      </td>
                      <td className="master-valor-vencido">
                        {e.vencidos_count} · {formatarMoeda(e.vencidos_valor)}
                      </td>
                      <td className="master-valor-pendente">
                        {e.pendentes_count} · {formatarMoeda(e.pendentes_valor)}
                      </td>
                      <td className="master-status-pago">
                        {e.pagos_count} · {formatarMoeda(e.pagos_valor)}
                      </td>
                      <td>
                        <strong>{formatarMoeda(Number(e.vencidos_valor) + Number(e.pendentes_valor))}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="master-financas-titulos">
            <h2>Faturas</h2>
            <div className="clients-tabela-wrap">
              {dados.titulos.length === 0 ? (
                <p className="painel-vazio">Nenhuma fatura cadastrada ainda.</p>
              ) : (
                <table className="clients-tabela">
                  <thead>
                    <tr>
                      <th>Empresa</th>
                      <th>Descrição</th>
                      <th>Valor</th>
                      <th>Vencimento</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.titulos.map((t) => (
                      <tr key={t.id}>
                        <td>
                          <strong>{t.empresa_nome}</strong>
                        </td>
                        <td>{t.descricao}</td>
                        <td>{formatarMoeda(t.valor)}</td>
                        <td>{formatarData(t.vencimento)}</td>
                        <td>
                          <span className={`master-status-${t.status_pagamento}`}>
                            {STATUS_LABEL[t.status_pagamento]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          <section className="master-financas-titulos">
            <h2>Licenças Compradas</h2>
            <div className="clients-tabela-wrap">
              {dados.licencas_compradas.length === 0 ? (
                <p className="painel-vazio">Nenhum parceiro comprou licenças ainda.</p>
              ) : (
                <table className="clients-tabela">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Parceiro</th>
                      <th>Licença</th>
                      <th>Valor</th>
                      <th>Periodicidade</th>
                      <th>Cliente</th>
                      <th>Comprada em</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.licencas_compradas.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <code className="licencas-codigo">{l.codigo}</code>
                        </td>
                        <td>
                          <Link href={`/master/revendas/${l.revenda_id}`} className="clients-ver-detalhes">
                            {l.revenda_nome}
                          </Link>
                        </td>
                        <td>{l.licenca_nome}</td>
                        <td>{formatarMoeda(l.valor)}</td>
                        <td>{l.periodicidade === "mensal" ? "Mensal" : "Anual"}</td>
                        <td>{l.empresa_nome ?? "Em estoque"}</td>
                        <td>{formatarData(l.created_at)}</td>
                        <td>
                          <span className={LICENCA_STATUS_CLASS[l.status]}>{LICENCA_STATUS_LABEL[l.status]}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
