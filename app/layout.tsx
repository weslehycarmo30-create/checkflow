import type { Metadata } from "next";
import { ThemeToggle } from "./theme-toggle";
import "./globals.css";

const themeInitializationScript = `
(() => {
  const key = "checkflow:theme";
  let theme;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === "light" || stored === "dark") theme = stored;
  } catch {}
  if (!theme) {
    theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
`;

export const metadata: Metadata = {
  title: "CheckFlow | Controle operacional para equipes",
  description: "Organize processos, atribua responsáveis, registre evidências, trate problemas e acompanhe sua operação com o CheckFlow.",
  openGraph: {
    title: "CheckFlow | Controle operacional para equipes",
    description: "Organize processos, atribua responsáveis, registre evidências, trate problemas e acompanhe sua operação com o CheckFlow.",
    type: "website",
  },
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitializationScript }} />
      </head>
      <body className="antialiased">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
