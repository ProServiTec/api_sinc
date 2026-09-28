"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { applyThemePrefs, areaFromPathname, readThemePrefs } from "./theme";

// Reaplica o tema da área atual sempre que a rota muda. O script inline do
// layout raiz (THEME_INIT_SCRIPT) só cuida do primeiro carregamento da
// página; navegações do Next.js (ex.: sair do /master e entrar no /painel)
// não recarregam o documento, então sem isso o tema de uma área ficaria
// "grudado" na tela ao trocar de login no mesmo navegador.
export function useAreaTheme(area: ReturnType<typeof areaFromPathname>) {
  const pathname = usePathname();

  useEffect(() => {
    const areaAtual = area ?? areaFromPathname(pathname);
    if (!areaAtual) return;
    applyThemePrefs(readThemePrefs(areaAtual));
  }, [area, pathname]);
}
