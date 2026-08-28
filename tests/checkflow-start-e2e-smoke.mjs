import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseURL = process.env.CHECKFLOW_E2E_BASE_URL || "http://127.0.0.1:3000";
const chromePath = process.env.CHECKFLOW_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ headless: true, executablePath: chromePath });
const page = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true });
const result = { baseURL, checks: [] };
const pass = (name, detail = "") => result.checks.push({ name, result: "PASS", detail });

try {
  const response = await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(2_000);
  assert.equal(response?.status(), 200);
  pass("servidor responde e página carrega", `HTTP ${response.status()}`);
  const assets = await page.evaluate(() => performance.getEntriesByType("resource").map(entry => entry.name).filter(name => /\.(css|js)(\?|$)/.test(name)));
  assert.ok(assets.length > 0, "nenhum asset CSS/JS foi carregado");
  pass("assets essenciais carregam", `${assets.length} assets`);
  assert.equal(await page.getByRole("heading", { name: "Entrar" }).isVisible(), true);
  pass("login aparece");
  const settings = await page.request.get("http://127.0.0.1:54321/auth/v1/settings");
  assert.equal(settings.status(), 200);
  pass("Supabase local responde", "127.0.0.1:54321");
  const email = process.env.CHECKFLOW_E2E_SMOKE_EMAIL;
  if (email) {
    page.on("console", message => console.log(`BROWSER ${message.type()}: ${message.text()}`));
    page.on("requestfailed", request => console.log(`REQUEST_FAILED ${request.url()}: ${request.failure()?.errorText}`));
    page.on("response", response => { if (response.url().includes("54321")) console.log(`SUPABASE ${response.status()} ${response.url()}`); });
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(process.env.CHECKFLOW_E2E_SMOKE_PASSWORD || "Checkflow123!");
    await page.getByRole("button", { name: "Entrar" }).click();
    try {
      await page.waitForURL(`${baseURL}/`, { timeout: 10_000 });
    } catch (error) {
      console.log(`AUTH_DIAGNOSTIC url=${page.url()} text=${JSON.stringify(await page.locator("body").innerText())}`);
      throw error;
    }
    pass("autenticação local funciona");
    await page.waitForTimeout(5_000);
    console.log(`DASHBOARD_DIAGNOSTIC url=${page.url()} text=${JSON.stringify((await page.locator("body").innerText()).slice(0, 1200))}`);
  }
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
}
