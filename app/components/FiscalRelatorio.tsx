"use client";

import "./fiscal.css";

export interface ResumoTipo {
  tipo: string;
  notas: number;
  valor: number;
}
export interface ResumoDirecao {
  direcao: "entrada" | "saida";
  notas: number;
  itens: number;
  valorTotal: number;
  porTipo: ResumoTipo[];
}
export interface ProdutoRank {
  cProd: string;
  xProd: string;
  ncm: string;
  quantidade: number;
  valor: number;
  notas: number;
}
export interface Agrupamento {
  chave: string;
  itens: number;
  quantidade: number;
  valor: number;
}
export interface Relatorio {
  competencia: string;
  disponivel: boolean;
  saida: ResumoDirecao;
  entrada: ResumoDirecao;
  topProdutos: ProdutoRank[];
  porNcm: Agrupamento[];
  porCfop: Agrupamento[];
  geradoEm: string;
}

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const num = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 3 });

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function rotuloCompetencia(comp: string): string {
  const [ano, mes] = comp.split("-").map(Number);
  return `${MESES[(mes || 1) - 1]}/${ano}`;
}

/** Competência (YYYY-MM) do mês anterior a hoje. */
export function competenciaMesAnterior(): string {
  const d = new Date();
  const ref = new Date(Date.UTC(d.getFullYear(), d.getMonth() - 1, 1));
  return `${ref.getUTCFullYear()}-${String(ref.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Corpo do relatório fiscal (KPIs + tabelas). Sem controles — cada página
 *  (painel/admin ou contador) fornece os seus. */
export default function FiscalRelatorio({ data }: { data: Relatorio }) {
  if (!data.disponivel) {
    return (
      <div className="fiscal-vazio-box">
        <p>Nenhuma nota fiscal encontrada para {rotuloCompetencia(data.competencia)}.</p>
        <p className="fiscal-vazio-hint">
          Se houve emissão de notas nesse mês, use <strong>Reprocessar</strong> para reprocessar a
          competência.
        </p>
      </div>
    );
  }

  const saldo = data.saida.valorTotal - data.entrada.valorTotal;

  return (
    <>
      <section className="fiscal-stats">
        <div className="fiscal-card">
          <span className="fiscal-card-label">Saídas (vendas)</span>
          <strong className="fiscal-card-value fiscal-card-value-blue">
            {brl.format(data.saida.valorTotal)}
          </strong>
          <span className="fiscal-card-sub">
            {data.saida.notas} nota(s) · {data.saida.itens} itens
          </span>
        </div>
        <div className="fiscal-card">
          <span className="fiscal-card-label">Entradas (compras)</span>
          <strong className="fiscal-card-value">{brl.format(data.entrada.valorTotal)}</strong>
          <span className="fiscal-card-sub">
            {data.entrada.notas} nota(s) · {data.entrada.itens} itens
          </span>
        </div>
        <div className="fiscal-card">
          <span className="fiscal-card-label">Saldo (saídas − entradas)</span>
          <strong className={`fiscal-card-value${saldo >= 0 ? " fiscal-card-value-blue" : ""}`}>
            {brl.format(saldo)}
          </strong>
        </div>
        <div className="fiscal-card">
          <span className="fiscal-card-label">Competência</span>
          <strong className="fiscal-card-value">{rotuloCompetencia(data.competencia)}</strong>
        </div>
      </section>

      <section className="fiscal-grid">
        <TabelaTipo titulo="Saídas por tipo" resumo={data.saida} />
        <TabelaTipo titulo="Entradas por tipo" resumo={data.entrada} />
      </section>

      <section className="fiscal-bloco">
        <h2>Produtos mais vendidos (saída)</h2>
        {data.topProdutos.length === 0 ? (
          <p className="fiscal-vazio">Sem itens de saída na competência.</p>
        ) : (
          <div className="fiscal-tabela-wrap">
            <table className="fiscal-tabela">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th>NCM</th>
                  <th className="fiscal-num">Qtd</th>
                  <th className="fiscal-num">Notas</th>
                  <th className="fiscal-num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {data.topProdutos.map((p, i) => (
                  <tr key={`${p.xProd}-${p.ncm}-${i}`}>
                    <td>{p.xProd || "—"}</td>
                    <td>{p.ncm || "—"}</td>
                    <td className="fiscal-num">{num.format(p.quantidade)}</td>
                    <td className="fiscal-num">{p.notas}</td>
                    <td className="fiscal-num">{brl.format(p.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="fiscal-grid">
        <TabelaAgrupamento titulo="Por CFOP" dados={data.porCfop} />
        <TabelaAgrupamento titulo="Por NCM" dados={data.porNcm} />
      </section>

      <p className="fiscal-rodape">Gerado em {new Date(data.geradoEm).toLocaleString("pt-BR")}.</p>
    </>
  );
}

function TabelaTipo({ titulo, resumo }: { titulo: string; resumo: ResumoDirecao }) {
  return (
    <div className="fiscal-bloco">
      <h2>{titulo}</h2>
      {resumo.porTipo.length === 0 ? (
        <p className="fiscal-vazio">Sem notas.</p>
      ) : (
        <div className="fiscal-tabela-wrap">
          <table className="fiscal-tabela">
            <thead>
              <tr>
                <th>Tipo</th>
                <th className="fiscal-num">Notas</th>
                <th className="fiscal-num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {resumo.porTipo.map((t) => (
                <tr key={t.tipo}>
                  <td>{t.tipo}</td>
                  <td className="fiscal-num">{t.notas}</td>
                  <td className="fiscal-num">{brl.format(t.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TabelaAgrupamento({ titulo, dados }: { titulo: string; dados: Agrupamento[] }) {
  return (
    <div className="fiscal-bloco">
      <h2>{titulo}</h2>
      {dados.length === 0 ? (
        <p className="fiscal-vazio">Sem dados.</p>
      ) : (
        <div className="fiscal-tabela-wrap">
          <table className="fiscal-tabela">
            <thead>
              <tr>
                <th>{titulo.replace("Por ", "")}</th>
                <th className="fiscal-num">Itens</th>
                <th className="fiscal-num">Valor</th>
              </tr>
            </thead>
            <tbody>
              {dados.map((d) => (
                <tr key={d.chave}>
                  <td>{d.chave}</td>
                  <td className="fiscal-num">{d.itens}</td>
                  <td className="fiscal-num">{brl.format(d.valor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
