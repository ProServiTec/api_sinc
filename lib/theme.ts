// Preferência de aparência (tema claro/escuro + cor principal) do usuário.
// Guardada no localStorage do navegador — vale por dispositivo, não por conta.

export type ThemeMode = "light" | "dark";

export interface ThemePrefs {
  mode: ThemeMode;
  accent: string; // hex de 6 dígitos, ex: "#2196F3"
}

export const THEME_STORAGE_KEY = "zaya:theme";

export const DEFAULT_THEME: ThemePrefs = { mode: "light", accent: "#2196F3" };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function readThemePrefs(): ThemePrefs {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    const parsed = JSON.parse(raw) as Partial<ThemePrefs>;
    return {
      mode: parsed.mode === "dark" ? "dark" : "light",
      accent: typeof parsed.accent === "string" && HEX_RE.test(parsed.accent) ? parsed.accent : DEFAULT_THEME.accent,
    };
  } catch {
    return DEFAULT_THEME;
  }
}

// Clareia (percent > 0) ou escurece (percent < 0) uma cor hex em até 100%.
export function shadeHex(hex: string, percent: number): string {
  if (!HEX_RE.test(hex)) return hex;
  const num = parseInt(hex.slice(1), 16);
  const amount = Math.round(255 * (percent / 100));
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amount);
  const g = clamp(((num >> 8) & 0xff) + amount);
  const b = clamp((num & 0xff) + amount);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Aplica o tema no documento (atributo data-theme + variáveis CSS da marca).
export function applyThemePrefs(prefs: ThemePrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", prefs.mode);
  if (HEX_RE.test(prefs.accent)) {
    root.style.setProperty("--brand", prefs.accent);
    root.style.setProperty("--brand-hover", shadeHex(prefs.accent, -15));
  }
}

export function saveThemePrefs(prefs: ThemePrefs) {
  applyThemePrefs(prefs);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // localStorage indisponível (modo privado, cookies bloqueados etc.) —
    // a preferência ainda funciona, só não persiste entre sessões.
  }
}

// Script inline executado antes da hidratação, pra pintar a tela já no tema
// certo e evitar o "flash" de tema claro seguido de troca pro escuro.
export const THEME_INIT_SCRIPT = `(function(){try{var r=localStorage.getItem('${THEME_STORAGE_KEY}');var p=r?JSON.parse(r):null;var mode=p&&p.mode==='dark'?'dark':'light';var accent=p&&typeof p.accent==='string'&&/^#[0-9a-fA-F]{6}$/.test(p.accent)?p.accent:'${DEFAULT_THEME.accent}';var root=document.documentElement;root.setAttribute('data-theme',mode);root.style.setProperty('--brand',accent);}catch(e){}})();`;
