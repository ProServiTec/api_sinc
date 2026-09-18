"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import "../painel/painel.css";
import "./master.css";

interface EmpresaSessao {
  id: string;
  nome: string;
  is_admin: boolean;
  is_master: boolean;
}

// Ícones SVG inline para cada item da nav
const ICONS: Record<string, React.ReactNode> = {
  "Visão Geral": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 10a8 8 0 1116 0A8 8 0 012 10zm8-6a1 1 0 00-1 1v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V5a1 1 0 00-1-1z" />
    </svg>
  ),
  "Parceiros": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.97 5.97 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.97 5.97 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
    </svg>
  ),
  "Empresas": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
    </svg>
  ),
  "Licenças": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
    </svg>
  ),
  "Finanças": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" />
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
    </svg>
  ),
  "Configurações": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
    </svg>
  ),
  "Meu Perfil": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { label: "Visão Geral", href: "/master" },
  { label: "Parceiros", href: "/master/revendas" },
  { label: "Empresas", href: "/master/clientes" },
  { label: "Licenças", href: "/master/licencas" },
  { label: "Finanças", href: "/master/financas" },
  { label: "Configurações", href: "/master/configuracoes" },
  { label: "Meu Perfil", href: null },
];

export default function MasterLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [empresa, setEmpresa] = useState<EmpresaSessao | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    Promise.resolve().then(() => {
      const raw = sessionStorage.getItem("empresa");
      setEmpresa(raw ? (JSON.parse(raw) as EmpresaSessao) : null);
      setPronto(true);
    });
  }, []);

  useEffect(() => {
    if (!pronto) return;
    if (!empresa) {
      router.replace("/login");
      return;
    }
    if (!empresa.is_master) {
      router.replace(empresa.is_admin ? "/painel" : "/vendas");
    }
  }, [pronto, empresa, router]);

  if (!pronto || !empresa || !empresa.is_master) {
    return null;
  }

  function sair() {
    sessionStorage.removeItem("empresa");
    router.push("/login");
  }

  return (
    <div className="painel-container">
      <aside className="painel-sidebar">
        {/* Logo Zaya Sistemas */}
        <div>
          <div className="painel-logo">
            <div className="painel-logo-icon">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
                <text x="1" y="17" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="16" fill="white">Z</text>
                <text x="14" y="10" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="10" fill="#2196F3">+</text>
              </svg>
            </div>
            <div className="painel-logo-text">
              <strong>Zaya Sistemas</strong>
              <span>Painel Master</span>
            </div>
          </div>

          <nav className="painel-nav">
            {NAV_ITEMS.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`painel-nav-item${pathname === item.href ? " painel-nav-item-active" : ""}`}
                >
                  {ICONS[item.label]}
                  {item.label}
                </Link>
              ) : (
                <span key={item.label} className="painel-nav-item painel-nav-item-disabled">
                  {ICONS[item.label]}
                  {item.label}
                </span>
              )
            )}
          </nav>
        </div>

        {empresa && (
          <div className="painel-sidebar-footer">
            <div className="painel-avatar">{empresa.nome.charAt(0).toUpperCase()}</div>
            <div className="painel-sidebar-empresa">
              <strong>{empresa.nome}</strong>
              <span className="master-badge">Master</span>
            </div>
            <button className="painel-sair" onClick={sair}>
              Sair da conta
            </button>
          </div>
        )}
      </aside>

      <main className="painel-main">{children}</main>
    </div>
  );
}
