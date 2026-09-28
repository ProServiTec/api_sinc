"use client";

import { useEffect, useState } from "react";
import "./theme-settings.css";
import { DEFAULT_THEME, readThemePrefs, saveThemePrefs, ThemePrefs } from "../../lib/theme";

const CORES_PRESET = [
  "#2196F3", // azul Zaya (padrão)
  "#0D9488", // verde-azulado
  "#7C3AED", // roxo
  "#DB2777", // rosa
  "#EA580C", // laranja
  "#16A34A", // verde
];

export default function ThemeSettings() {
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULT_THEME);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    setPrefs(readThemePrefs());
    setPronto(true);
  }, []);

  function atualizar(next: Partial<ThemePrefs>) {
    setPrefs((atual) => {
      const novo = { ...atual, ...next };
      saveThemePrefs(novo);
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
        <label>Tema</label>
        <div className="theme-mode-group">
          <button
            type="button"
            className={`theme-mode-btn${prefs.mode === "light" ? " theme-mode-btn-active" : ""}`}
            onClick={() => atualizar({ mode: "light" })}
          >
            ☀️ Claro
          </button>
          <button
            type="button"
            className={`theme-mode-btn${prefs.mode === "dark" ? " theme-mode-btn-active" : ""}`}
            onClick={() => atualizar({ mode: "dark" })}
          >
            🌙 Escuro
          </button>
        </div>
      </div>

      <div className="theme-settings-field">
        <label>Cor principal</label>
        <div className="perfil-cor-wrap">
          <input
            type="color"
            className="perfil-cor-preview"
            value={prefs.accent}
            onChange={(e) => atualizar({ accent: e.target.value })}
            aria-label="Escolher cor principal"
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
      </div>

      <button type="button" className="theme-reset-btn" onClick={() => atualizar(DEFAULT_THEME)}>
        Restaurar padrão
      </button>

      <p className="theme-settings-hint">
        A aparência é salva neste navegador/dispositivo.
      </p>
    </section>
  );
}
