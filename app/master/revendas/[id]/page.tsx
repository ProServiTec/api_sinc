"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import "../../../painel/clients/clients.css";
import "../../master.css";

interface LicencaRevenda {
  id: string;
  codigo: string;
  licenca_id: string;
  licenca_nome: string;
  valor: string;
  periodicidade: "mensal" | "anual";
  dia_fechamento: number;
  empresa_id: string | null;
  empresa_nome: string | null;
  ativo: boolean;
  created_at: string;
  status: "ativa" | "atrasada" | "cancelada";
}

interface Detalhe {
  revenda: {
    id: string;
    nome: string;
    razao_social: string | null;
    cpf_cnpj: string | null;
    ativo: boolean;
    created_at: string;
  };
  resumo: {
    total: number;
    ativas: number;
    atrasadas: number;
    canceladas: number;
    em_estoque: number;
    atribuidas: number;
  };
  licencas: LicencaRevenda[];
}

const STATUS_LABEL: Record<LicencaRevenda["status"], string> = {
  ativa: "Ativa",
  atrasada: "Atrasada",
  cancelada: "Cancelada",
};

const STATUS_CLASS: Record<LicencaRevenda["status"], string> = {
  ativa: "master-status-pago",
  atrasada: "master-status-atrasado",
  cancelada: "master-status-cancelada",
};

function formatarData(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function formatarMoeda(valor: string | number) {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function DetalheRevenda() {
  const params = useParams<{ id: string }>();
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function carregar() {
    setLoading(true);
    setError(null);
    fetch(`/api/master/revendas/${encodeURIComponent(params.id)}`)
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error ?? "Não foi possível carregar o parceiro");
        }
        setDetalhe(data as Detalhe);
      })
      .catch((err) => setError(err.message ?? "Não foi possível carregar o parceiro"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    Promise.resolve().then(carregar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function alternarStatus(licenca: LicencaRevenda) {
    const novoAtivo = !licenca.ativo;
    const acao = novoAtivo ? "reativar" : "cancelar";
    if (!confirm(`Deseja ${acao} a licença "${licenca.licenca_nome}"?`)) return;

    try {
      const response = await fetch(
        `/api/master/revendas/${encodeURIComponent(params.id)}/licencas/${licenca.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ativo: novoAtivo }),
        }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? `Não foi possível ${acao} a licença`);
      }
      carregar();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Não foi possível ${acao} a licença`);
    }
  }

  return (
    <>
      <Link href="/master/revendas" className="clients-voltar">
        ← Voltar
      </Link>

      {loading && <p className="painel-loading">Carregando parceiro...</p>}
      {error && <p className="painel-error">{error}</p>}

      {detalhe && (
        <>
          <header className="clients-detalhe-header">
            <h1>{detalhe.revenda.nome}</h1>
            <span className={detalhe.revenda.ativo ? "painel-badge-ativo" : "painel-badge-inativo"}>
              {detalhe.revenda.ativo ? "Ativa" : "Inativa"}
            </span>
          </header>
          {detalhe.revenda.razao_social && <p className="clients-detalhe-sub">{detalhe.revenda.razao_social}</p>}
          {detalhe.revenda.cpf_cnpj && <p className="clients-detalhe-sub">{detalhe.revenda.cpf_cnpj}</p>}

          <section className="painel-stats">
            <div className="painel-card">
              <span className="painel-card-label">Licenças compradas</span>
              <strong className="painel-card-value painel-card-value-blue">{detalhe.resumo.total}</strong>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Ativas</span>
              <strong className="painel-card-value master-status-pago">{detalhe.resumo.ativas}</strong>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Atrasadas</span>
              <strong className="painel-card-value master-status-atrasado">{detalhe.resumo.atrasadas}</strong>
            </div>
            <div className="painel-card">
              <span className="painel-card-label">Canceladas</span>
              <strong className="painel-card-value master-status-cancelada">{detalhe.resumo.canceladas}</strong>
            </div>
          </section>

          <section className="clients-detalhe-card">
            <h2>Dados do Parceiro</h2>
            <div className="clients-dados-grid">
              <div>
                <span className="clients-dados-label">CNPJ</span>
                <strong>{detalhe.revenda.cpf_cnpj ?? "—"}</strong>
              </div>
              <div>
                <span className="clients-dados-label">Razão social</span>
                <strong>{detalhe.revenda.razao_social ?? "—"}</strong>
              </div>
              <div>
                <span className="clients-dados-label">Cadastrada em</span>
                <strong>{formatarData(detalhe.revenda.created_at)}</strong>
              </div>
              <div>
                <span className="clients-dados-label">Em estoque / atribuídas</span>
                <strong>
                  {detalhe.resumo.em_estoque} / {detalhe.resumo.atribuidas}
                </strong>
              </div>
            </div>
          </section>

          <section className="clients-detalhe-card">
            <h2>Licenças compradas ({detalhe.licencas.length})</h2>
            {detalhe.licencas.length === 0 ? (
              <p className="painel-vazio">Este parceiro ainda não comprou nenhuma licença.</p>
            ) : (
              <div className="clients-tabela-wrap">
                <table className="clients-tabela">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Licença</th>
                      <th>Valor</th>
                      <th>Periodicidade</th>
                      <th>Cliente</th>
                      <th>Comprada em</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.licencas.map((l) => (
                      <tr key={l.id}>
                        <td>
                          <code className="licencas-codigo">{l.codigo}</code>
                        </td>
                        <td>
                          <strong>{l.licenca_nome}</strong>
                        </td>
                        <td>{formatarMoeda(l.valor)}</td>
                        <td>{l.periodicidade === "mensal" ? "Mensal" : "Anual"}</td>
                        <td>{l.empresa_nome ?? "Em estoque"}</td>
                        <td>{formatarData(l.created_at)}</td>
                        <td>
                          <span className={STATUS_CLASS[l.status]}>{STATUS_LABEL[l.status]}</span>
                        </td>
                        <td>
                          <button className="master-revenda-acao-btn" onClick={() => alternarStatus(l)}>
                            {l.ativo ? "Cancelar" : "Reativar"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
