"use client";

import { useEffect, useState } from "react";
import "./theme-settings.css";
import { DEFAULT_THEME, readThemePrefs, saveThemePrefs, ThemeArea, ThemePrefs } from "../../lib/theme";

const CORES_PRESET = [
  "#2196F3", // azul Zaya (padrão)
  "#0D9488", // verde-azulado
  "#7C3AED", // roxo
  "#DB2777", // rosa
  "#EA580C", // laranja
  "#16A34A", // verde
];

interface ThemeSettingsProps {
  // Área de login dona dessa preferência (vendedor, cliente/admin ou
  // master). Cada área guarda sua própria escolha — trocar o tema numa
  // área não deve mudar a aparência das outras no mesmo navegador.
  area: ThemeArea;
}

export default function ThemeSettings({ area }: ThemeSettingsProps) {
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULT_THEME);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setPrefs(readThemePrefs(area));
    setPronto(true);
  }, [area]);

  function atualizar(next: Partial<ThemePrefs>) {
    setPrefs((atual) => {
      const novo = { ...atual, ...next };
      saveThemePrefs(area, novo);
      return novo;
    });
  }

  // Evita um primeiro render com o tema padrão antes de ler o localStorage
  // (senão os botões piscam "Claro" selecionado por uma fração de segundo).
  if (!pronto) return null;

  return (
    <section className="perfil-section theme-settings">
      <h2>Aparência</h2>

      <div className="theme-settings-field">
        <label>Modo de tema (fundo e menus)</label>
        <div className="theme-mode-group">
          <button
            type="button"
            className={`theme-mode-btn${prefs.mode === "light" ? " theme-mode-btn-active" : ""}`}
            onClick={() => atualizar({ mode: "light" })}
          >
            ☀️ Fundo Claro
          </button>
          <button
            type="button"
            className={`theme-mode-btn${prefs.mode === "dark" ? " theme-mode-btn-active" : ""}`}
            onClick={() => atualizar({ mode: "dark" })}
          >
            🌙 Fundo Escuro
          </button>
        </div>
        <p className="theme-settings-hint" style={{ marginTop: "0.35rem" }}>
          {prefs.mode === "light"
            ? "Modo Claro: fundo branco, menu lateral branco e texto escuro de alta legibilidade."
            : "Modo Escuro: fundo preto/marinho e menus escuros para menor cansaço visual."}
        </p>
      </div>

      <div className="theme-settings-field">
        <label>Cor de destaque (botões e detalhes)</label>
        <div className="perfil-cor-wrap">
          <input
            type="color"
            className="perfil-cor-preview"
            value={prefs.accent}
            onChange={(e) => atualizar({ accent: e.target.value })}
            aria-label="Escolher cor de destaque"
          />
          <span className="theme-color-value">{prefs.accent.toUpperCase()}</span>
        </div>

        <div className="theme-swatches">
          {CORES_PRESET.map((cor) => (
            <button
              key={cor}
              type="button"
              className={`theme-swatch${prefs.accent.toLowerCase() === cor.toLowerCase() ? " theme-swatch-active" : ""}`}
              style={{ background: cor }}
              onClick={() => atualizar({ accent: cor })}
              aria-label={`Usar cor ${cor}`}
              title={cor}
            />
          ))}
        </div>
        <p className="theme-settings-hint" style={{ marginTop: "0.35rem" }}>
          O contraste das fontes e botões é calculado de forma inteligente para que o texto nunca fique apagado ou ilegível.
        </p>
      </div>

      <button type="button" className="theme-reset-btn" onClick={() => atualizar(DEFAULT_THEME)}>
        Restaurar padrão
      </button>

      <p className="theme-settings-hint">
        A aparência é salva neste navegador/dispositivo e vale só pra esta área.
      </p>
    </section>
  );
}
