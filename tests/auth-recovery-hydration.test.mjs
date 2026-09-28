import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { chromium } from "playwright-core";

const chromePath = process.env.CHECKFLOW_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

async function getAvailablePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  server.close();
  return port;
}

async function startLocalServer() {
  const port = await getAvailablePort();
  const origin = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["scripts/start-local.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/auth`);
      if (response.ok) return { child, origin };
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`local server did not start: ${output}`);
}

test("recovery URL hydrates deterministically and then shows the reset form", { timeout: 30_000 }, async () => {
  const { child, origin } = await startLocalServer();
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await browser.newPage();
  const hydrationFailures = [];
  page.on("console", message => {
    if (/hydration failed|server rendered text didn't match|unhandled script error/i.test(message.text())) hydrationFailures.push(message.text());
  });
  page.on("pageerror", error => {
    if (/hydration|server rendered text didn't match/i.test(error.message)) hydrationFailures.push(error.message);
  });

  try {
    const response = await page.goto(`${origin}/auth?mode=reset#type=recovery`, { waitUntil: "networkidle" });
    assert.equal(response?.status(), 200);
    await expectResetForm(page);
    await page.getByRole("button", { name: "Voltar ao login" }).click();
    assert.equal(await page.getByRole("heading", { name: "Entrar" }).isVisible(), true);
    assert.deepEqual(hydrationFailures, []);
  } finally {
    await browser.close();
    child.kill();
    await once(child, "exit");
  }
});

async function expectResetForm(page) {
  assert.equal(await page.getByRole("heading", { name: "Definir nova senha" }).isVisible(), true);
  assert.equal(await page.locator('input[type="email"]').count(), 0);
  assert.equal(await page.locator('input[type="password"]').count(), 1);
  assert.equal(await page.getByRole("button", { name: "Salvar nova senha" }).isVisible(), true);
}
