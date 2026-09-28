import "./globals.css";
import { THEME_INIT_SCRIPT } from "../lib/theme";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-br">
      <head>
        {/* Aplica o tema salvo (claro/escuro + cor) antes da primeira pintura,
            pra não piscar em claro e trocar pro escuro depois. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
