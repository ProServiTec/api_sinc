"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import "../painel/painel.css";

interface EmpresaSessao {
  id: string;
  nome: string;
  is_admin: boolean;
  is_master: boolean;
}

const ICONS: Record<string, React.ReactNode> = {
  "Visão Geral": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 10a8 8 0 1116 0A8 8 0 012 10zm8-6a1 1 0 00-1 1v4a1 1 0 00.293.707l2.5 2.5a1 1 0 001.414-1.414L11 9.586V5a1 1 0 00-1-1z" />
    </svg>
  ),
  "Clientes": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
    </svg>
  ),
  "Dispositivos": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 5a2 2 0 012-2h10a2 2 0 012 2v8a2 2 0 01-2 2h-2.22l.123.489.804.804A1 1 0 0113 17H7a1 1 0 01-.707-1.707l.804-.804L7.22 14H5a2 2 0 01-2-2V5zm5.771 7H5V5h10v7H8.771z" clipRule="evenodd" />
    </svg>
  ),
  "Faturas": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  ),
  "Meu Perfil": (
    <svg className="painel-nav-icon" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  ),
};

const NAV_ITEMS = [
  { label: "Visão Geral", href: "/painel" },
  { label: "Clientes", href: "/painel/clients" },
  { label: "Dispositivos", href: null },
  { label: "Faturas", href: "/painel/faturas" },
  { label: "Meu Perfil", href: "/perfil" },
];

export default function PerfilLayout({ children }: { children: React.ReactNode }) {
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
    }
  }, [pronto, empresa, router]);

  if (!pronto || !empresa) return null;

  function sair() {
    sessionStorage.removeItem("empresa");
    router.push("/login");
  }

  return (
    <div className="painel-container">
      <aside className="painel-sidebar">
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
              <span>Painel Admin</span>
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

        <div className="painel-sidebar-footer">
          <div className="painel-avatar">{empresa.nome.charAt(0).toUpperCase()}</div>
          <div className="painel-sidebar-empresa">
            <strong>{empresa.nome}</strong>
          </div>
          <button className="painel-sair" onClick={sair}>
            Sair da conta
          </button>
        </div>
      </aside>

      <main className="painel-main">{children}</main>
    </div>
  );
}
