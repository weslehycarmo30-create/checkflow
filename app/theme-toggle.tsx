"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "checkflow:theme";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setTheme(currentTheme()));
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

  return (
    <button
      type="button"
      className="theme-toggle"
      aria-label={`Ativar ${nextLabel.toLowerCase()}`}
      title={`Ativar ${nextLabel.toLowerCase()}`}
      onClick={() => {
        window.localStorage.setItem(STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
        setTheme(nextTheme);
      }}
    >
      <span aria-hidden="true">{nextTheme === "dark" ? "☾" : "☀"}</span>
      <span>{nextLabel}</span>
    </button>
  );
}
