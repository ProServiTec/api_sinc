// Preferência de aparência (tema claro/escuro + cor principal), separada por
// "área" de login — vendedor (/vendas), cliente/admin (/painel + /perfil) e
// master (/master). Cada área guarda a própria preferência no localStorage do
// navegador (por dispositivo, não por conta), pra escolher o tema numa área
// não mudar a aparência das outras no mesmo navegador.

export type ThemeMode = "light" | "dark";

export type ThemeArea = "vendas" | "painel" | "master";

export interface ThemePrefs {
  mode: ThemeMode;
  accent: string; // hex de 6 dígitos, ex: "#2196F3"
}

export const DEFAULT_THEME: ThemePrefs = { mode: "light", accent: "#2196F3" };

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function themeStorageKey(area: ThemeArea): string {
  return `zaya:theme:${area}`;
}

// A área é decidida pelo caminho da URL, não pela conta logada — assim o
// mesmo navegador pode ter uma aparência diferente em cada seção, mesmo que
// a pessoa troque de login sem recarregar a página inteira.
export function areaFromPathname(pathname: string): ThemeArea | null {
  if (pathname.startsWith("/vendas")) return "vendas";
  if (pathname.startsWith("/master")) return "master";
  if (pathname.startsWith("/painel") || pathname.startsWith("/perfil")) return "painel";
  return null;
}

export function readThemePrefs(area: ThemeArea): ThemePrefs {
  if (typeof window === "undefined") return DEFAULT_THEME;
  try {
    const raw = window.localStorage.getItem(themeStorageKey(area));
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

// Calcula a luminância percebida (ITU-R BT.709) de 0 (preto) a 1 (branco).
export function getLuminance(hex: string): number {
  if (!HEX_RE.test(hex)) return 0;
  const num = parseInt(hex.slice(1), 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// Cor ideal do texto para contraste garantido sobre a cor principal:
// se a cor for clara (ex: amarelo, ciano ou branco), texto fica escuro (#0D1B2A);
// se a cor for escura/média (ex: azul, roxo, vermelho), texto fica branco (#FFFFFF).
export function getContrastColor(hex: string): string {
  return getLuminance(hex) > 0.55 ? "#0D1B2A" : "#FFFFFF";
}

// Aplica o tema no documento atual (atributo data-theme + variáveis CSS da
// marca). Não sabe de qual área a preferência veio — quem chama já filtrou.
export function applyThemePrefs(prefs: ThemePrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", prefs.mode);
  if (HEX_RE.test(prefs.accent)) {
    const lum = getLuminance(prefs.accent);
    const isLight = lum > 0.55;
    const isVeryLight = lum > 0.85;

    root.style.setProperty("--brand", prefs.accent);
    root.style.setProperty("--brand-hover", isVeryLight ? "#E2E8F0" : shadeHex(prefs.accent, -15));
    root.style.setProperty("--brand-contrast", isLight ? "#0D1B2A" : "#FFFFFF");
    root.style.setProperty("--brand-border", isVeryLight ? "#CBD5E1" : prefs.accent);
  }
}

export function saveThemePrefs(area: ThemeArea, prefs: ThemePrefs) {
  applyThemePrefs(prefs);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(themeStorageKey(area), JSON.stringify(prefs));
  } catch {
    // localStorage indisponível (modo privado, cookies bloqueados etc.) —
    // a preferência ainda funciona, só não persiste entre sessões.
  }
}

// Script inline executado antes da hidratação, pra pintar a tela já no tema
// certo (da área certa, decidida pelo caminho da própria URL) e evitar o
// "flash" de tema claro seguido de troca pro escuro.
export const THEME_INIT_SCRIPT = `(function(){try{var path=location.pathname;var area=path.indexOf('/vendas')===0?'vendas':(path.indexOf('/master')===0?'master':((path.indexOf('/painel')===0||path.indexOf('/perfil')===0)?'painel':null));if(!area)return;var r=localStorage.getItem('zaya:theme:'+area);var p=r?JSON.parse(r):null;var mode=p&&p.mode==='dark'?'dark':'light';var accent=p&&typeof p.accent==='string'&&/^#[0-9a-fA-F]{6}$/.test(p.accent)?p.accent:'${DEFAULT_THEME.accent}';var root=document.documentElement;root.setAttribute('data-theme',mode);root.style.setProperty('--brand',accent);var n=parseInt(accent.slice(1),16);var lum=(0.2126*(n>>16&255)+0.7152*(n>>8&255)+0.0722*(n&255))/255;root.style.setProperty('--brand-contrast',lum>0.55?'#0D1B2A':'#FFFFFF');root.style.setProperty('--brand-border',lum>0.85?'#CBD5E1':accent);}catch(e){}})();`;
