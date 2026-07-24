"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "checkflow:theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [mounted, setMounted] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
      setMounted(true);
    });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const followSystemPreference = (event: MediaQueryListEvent) => {
      if (window.localStorage.getItem(STORAGE_KEY)) return;
      const nextTheme = event.matches ? "dark" : "light";
      applyTheme(nextTheme);
      setTheme(nextTheme);
    };

    media.addEventListener("change", followSystemPreference);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", followSystemPreference);
    };
  }, []);

  const nextTheme = theme === "dark" ? "light" : "dark";
  const nextLabel = nextTheme === "dark" ? "Tema escuro" : "Tema claro";
  const label = mounted ? `Ativar ${nextLabel.toLowerCase()}` : "Alternar tema";

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={label}
      title={label}
      onClick={() => {
        if (!mounted) return;
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
    >
      <span aria-hidden="true">{mounted ? (nextTheme === "dark" ? "☾" : "☀") : "◐"}</span>
      <span>{mounted ? nextLabel : "Alternar tema"}</span>
    </button>
  );
}
