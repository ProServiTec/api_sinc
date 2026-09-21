"use client";

import type { ReactNode } from "react";
import "./ModalPagamento.css";

export type MetodoPagamento = "pix" | "cartao";

interface ModalPagamentoProps {
  resumo: ReactNode;
  valorFormatado: string;
  metodo: MetodoPagamento;
  onMetodoChange: (metodo: MetodoPagamento) => void;
  processando: boolean;
  onConfirmar: () => void;
  onFechar: () => void;
}

function IconeQrCode() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v3M14 20h3M20 20h1" />
    </svg>
  );
}

function IconeCartao() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 15h4" />
    </svg>
  );
}

function IconeFechar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconeEscudo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

const OPCOES: {
  id: MetodoPagamento;
  titulo: string;
  descricao: string;
  classeIcone: string;
  Icone: () => ReactNode;
}[] = [
  {
    id: "pix",
    titulo: "PIX",
    descricao: "Aprovação imediata · QR Code gerado pela InfinitePay",
    classeIcone: "pgto-icone-pix",
    Icone: IconeQrCode,
  },
  {
    id: "cartao",
    titulo: "Cartão de crédito",
    descricao: "Parcelamento disponível · Processado pela InfinitePay",
    classeIcone: "pgto-icone-cartao",
    Icone: IconeCartao,
  },
];

export default function ModalPagamento({
  resumo,
  valorFormatado,
  metodo,
  onMetodoChange,
  processando,
  onConfirmar,
  onFechar,
}: ModalPagamentoProps) {
  return (
    <div className="pgto-overlay" onClick={() => !processando && onFechar()}>
      <div
        className="pgto-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pgto-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pgto-header">
          <div>
            <h2 id="pgto-titulo" className="pgto-title">
              Escolha como pagar
            </h2>
            <p className="pgto-resumo">{resumo}</p>
          </div>
          <button type="button" className="pgto-fechar" onClick={onFechar} disabled={processando} aria-label="Fechar">
            <IconeFechar />
          </button>
        </div>

        <div className="pgto-opcoes" role="radiogroup" aria-label="Forma de pagamento">
          {OPCOES.map(({ id, titulo, descricao, classeIcone, Icone }) => {
            const ativa = metodo === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={ativa}
                className={`pgto-opcao${ativa ? " pgto-opcao-ativa" : ""}`}
                onClick={() => onMetodoChange(id)}
              >
                <span className={`pgto-icone ${classeIcone}`}>
                  <Icone />
                </span>
                <span className="pgto-texto">
                  <strong>{titulo}</strong>
                  <span>{descricao}</span>
                </span>
                <span className="pgto-radio" />
              </button>
            );
          })}
        </div>

        <div className="pgto-acoes">
          <button type="button" className="pgto-btn pgto-btn-secundario" onClick={onFechar} disabled={processando}>
            Cancelar
          </button>
          <button type="button" className="pgto-btn pgto-btn-primario" onClick={onConfirmar} disabled={processando}>
            {processando ? (
              <>
                <span className="pgto-spinner" />
                Gerando cobrança...
              </>
            ) : (
              <>Confirmar · {valorFormatado}</>
            )}
          </button>
        </div>

        <p className="pgto-seguranca">
          <IconeEscudo />
          Pagamento processado com segurança pela InfinitePay
        </p>
      </div>
    </div>
  );
}
