"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import "./painel.css";

interface EmpresaSessao {
  id: string;
  nome: string;
  is_admin: boolean;
  is_master: boolean;
}

const NAV_ITEMS = [
  { label: "Visão Geral", href: "/painel" },
  { label: "Clientes", href: "/painel/clients" },
  { label: "Licenças", href: "/painel/licencas" },
  { label: "Dispositivos", href: null },
  { label: "Faturas", href: "/painel/faturas" },
  { label: "Meu Perfil", href: null },
];

export default function PainelLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  // Começa igual em servidor e cliente (null) — o sessionStorage só existe no
  // navegador, então é lido depois de montar, nunca no render inicial (evita
  // hydration mismatch).
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
    if (empresa.is_master) {
      router.replace("/master");
      return;
    }
    if (!empresa.is_admin) {
      router.replace("/vendas");
    }
  }, [pronto, empresa, router]);

  if (!pronto || !empresa || empresa.is_master || !empresa.is_admin) {
    return null;
  }

  function sair() {
    sessionStorage.removeItem("empresa");
    router.push("/login");
  }

  return (
    <div className="painel-container">
      <aside className="painel-sidebar">
        <nav className="painel-nav">
          {NAV_ITEMS.map((item) =>
            item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className={`painel-nav-item${pathname === item.href ? " painel-nav-item-active" : ""}`}
              >
                {item.label}
              </Link>
            ) : (
              <span key={item.label} className="painel-nav-item painel-nav-item-disabled">
                {item.label}
              </span>
            )
          )}
        </nav>

        {empresa && (
          <div className="painel-sidebar-footer">
            <div className="painel-avatar">{empresa.nome.charAt(0).toUpperCase()}</div>
            <div className="painel-sidebar-empresa">
              <strong>{empresa.nome}</strong>
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
