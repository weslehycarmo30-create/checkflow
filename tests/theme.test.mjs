import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const toggle = await readFile(new URL("../app/theme-toggle.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const initializationScript = layout.match(/const themeInitializationScript = `([\s\S]*?)`;/)?.[1];

function runInitialization({ stored = null, systemDark = false } = {}) {
  const documentElement = { dataset: {}, style: {} };
  const context = {
    document: { documentElement },
    window: {
      localStorage: { getItem: () => stored },
      matchMedia: () => ({ matches: systemDark }),
    },
  };
  vm.runInNewContext(initializationScript, context);
  return documentElement;
}

test("first visit follows the operating system preference", () => {
  assert.ok(initializationScript);
  const root = runInitialization({ systemDark: true });
  assert.equal(root.dataset.theme, "dark");
  assert.equal(root.style.colorScheme, "dark");
});

test("stored preference wins after refresh", () => {
  const dark = runInitialization({ stored: "dark", systemDark: false });
  const light = runInitialization({ stored: "light", systemDark: true });
  assert.equal(dark.dataset.theme, "dark");
  assert.equal(light.dataset.theme, "light");
  assert.match(toggle, /localStorage\.setItem\(STORAGE_KEY, nextTheme\)/);
});

test("ThemeToggle has a deterministic initial render without browser reads", () => {
  const componentBeforeEffect = toggle.slice(
    toggle.indexOf("export function ThemeToggle"),
    toggle.indexOf("useEffect"),
  );

  assert.match(toggle, /const \[mounted, setMounted\] = useState\(false\)/);
  assert.match(toggle, /const \[theme, setTheme\] = useState<Theme>\("light"\)/);
  assert.match(toggle, /aria-label=\{label\}/);
  assert.match(toggle, /title=\{label\}/);
  assert.match(toggle, /mounted \? nextLabel : "Alternar tema"/);
  assert.doesNotMatch(componentBeforeEffect, /\b(window|document|localStorage|matchMedia)\b/);
  assert.doesNotMatch(toggle, /useState<Theme>\([^"']|currentTheme/);
});

test("theme initializes in the document head before page content", () => {
  assert.ok(layout.indexOf("themeInitializationScript") < layout.indexOf("<body"));
  assert.ok(layout.indexOf("<ThemeToggle />") < layout.indexOf("{children}"));
});

test("dark theme covers responsive controls without filtering evidence", () => {
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /@media\(max-width:760px\)\{\.theme-toggle/);
  assert.match(css, /\[data-theme="dark"\] img\{filter:none\}/);
  assert.match(css, /\.progress-track/);
  assert.match(css, /\.failure-details/);
  assert.match(css, /\.history-occurrence/);
  assert.match(css, /\.plan-status\.rejected/);
});
