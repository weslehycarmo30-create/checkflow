import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseURL = process.env.CHECKFLOW_E2E_BASE_URL || "http://127.0.0.1:3001";
const supabaseURL = process.env.CHECKFLOW_LOCAL_SUPABASE_URL || "http://127.0.0.1:55421";
const serviceRoleKey = process.env.CHECKFLOW_LOCAL_SERVICE_ROLE_KEY;
const chromePath = process.env.CHECKFLOW_CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const password = "Checkflow123!";
const runName = `SMOKE RATING ${Date.now().toString(36)}`;
const users = {
  owner: "owner-e2e@checkflow.test",
  executor: "executor-e2e@checkflow.test",
  executor2: "executor2-e2e@checkflow.test",
};
const checks = [];
let checklistId = null;

function check(name, condition, detail = "") {
  assert.ok(condition, `${name}${detail ? `: ${detail}` : ""}`);
  checks.push(name);
}

async function login(page, email) {
  await page.goto(`${baseURL}/auth`, { waitUntil: "domcontentloaded" });
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(`${baseURL}/`, { timeout: 60_000 });
  await page.locator(".workspace").filter({ hasText: "Organização E2E A" }).waitFor();
}

async function logout(page) {
  await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
  const menu = page.getByRole("button", { name: "Abrir menu" });
  if (await menu.count() && await menu.isVisible()) await menu.click();
  const button = page.locator('button[aria-label="Sair do CheckFlow"]').filter({ visible: true }).first();
  await button.click();
  await page.waitForURL(/\/auth$/);
}

async function cleanup() {
  if (!serviceRoleKey || !checklistId) return;
  const headers = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
  for (const table of ["checklist_assignments", "checklist_executions", "checklists"]) {
    await fetch(`${supabaseURL}/rest/v1/${table}?checklist_id=eq.${checklistId}`, { method: "DELETE", headers });
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const context = await browser.newContext({ viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  try {
    await login(page, users.owner);
    await page.getByRole("button", { name: /Novo checklist/ }).click();
    await page.getByLabel("Nome do checklist").fill(runName);
    await page.getByLabel("Área da operação").selectOption({ label: "Bar" });
    await page.getByRole("button", { name: "Criar checklist" }).click();
    await page.getByText(runName, { exact: true }).first().click();
    await page.waitForURL(/\/checklists\//);
    checklistId = new URL(page.url()).pathname.split("/").pop();
    await page.getByPlaceholder("Nome da nova seção").fill("Teste rating");
    await page.getByRole("button", { name: "Adicionar seção" }).click();
    const section = page.locator(".checklist-section").first();
    await section.getByPlaceholder("Novo item obrigatório").fill("Item temporário");
    await section.getByRole("button", { name: "Adicionar item" }).click();
    await section.getByRole("button", { name: "Editar item" }).click();
    await page.getByLabel("Texto do item").fill("Item editado");
    await page.getByRole("button", { name: "Salvar item" }).click();
    check("owner edita item em rascunho", await page.getByText("Item editado", { exact: true }).isVisible());
    await section.getByRole("button", { name: "Remover" }).click();
    page.once("dialog", dialog => dialog.accept());
    await page.waitForTimeout(300);
    check("owner remove item em rascunho", !(await page.getByText("Item editado", { exact: true }).count()));
    await section.getByPlaceholder("Novo item obrigatório").fill("Avaliação operacional");
    await section.getByRole("combobox", { name: "Tipo de resposta" }).selectOption("rating");
    await section.getByRole("button", { name: "Adicionar item" }).click();
    await page.locator(".assignment-card select").first().selectOption({ label: "Executor E2E" });
    await page.getByRole("button", { name: "Atribuir ao colaborador" }).click();
    await logout(page);

    await login(page, users.executor);
    await page.getByText(runName, { exact: true }).click();
    await page.getByRole("button", { name: "Iniciar checklist" }).click();
    const rating = page.getByLabel("Avaliação de 0 a 10");
    await rating.selectOption("0");
    await page.getByText("Resposta salva.").waitFor();
    check("rating 0 responde", await rating.inputValue() === "0");
    check("rating 0 conta no progresso", (await page.locator(".progress-label").innerText()).includes("100%"));
    await rating.selectOption("5");
    await page.getByText("Resposta salva.").waitFor();
    check("rating 5 responde", await rating.inputValue() === "5");
    await rating.selectOption("10");
    await page.getByText("Resposta salva.").waitFor();
    check("rating 10 responde", await rating.inputValue() === "10");
    await page.reload({ waitUntil: "domcontentloaded" });
    check("rating persiste após reload", await page.getByLabel("Avaliação de 0 a 10").inputValue() === "10");
    await page.getByRole("button", { name: "Finalizar checklist" }).click();
    await page.getByRole("heading", { name: "Checklist finalizado", exact: true }).waitFor();
    check("rating permite conclusão", true);
    await logout(page);

    await login(page, users.owner);
    await page.getByText(runName, { exact: true }).first().click();
    await page.waitForURL(/\/checklists\//);
    await page.locator(".assignment-card select").first().selectOption({ label: "Executor 2 E2E" });
    await page.getByRole("button", { name: "Atribuir ao colaborador" }).click();
    check("segunda atribuição aceita checklist concluído", await page.getByText("Executor 2 E2E", { exact: true }).isVisible());
    await logout(page);

    await login(page, users.executor2);
    check("executor não recebe edição estrutural", await page.getByText(runName, { exact: true }).isVisible() && await page.getByRole("button", { name: "Editar item" }).count() === 0);
    await page.getByText(runName, { exact: true }).click();
    await page.getByRole("button", { name: "Iniciar checklist" }).click();
    await page.getByLabel("Avaliação de 0 a 10").selectOption("5");
    await page.getByText("Resposta salva.").waitFor();
    await page.getByRole("button", { name: "Finalizar checklist" }).click();
    await page.getByRole("heading", { name: "Checklist finalizado", exact: true }).waitFor();
    check("segunda execução é independente", true);
    console.log(JSON.stringify({ runName, checks: checks.length, passed: checks }));
  } finally {
    await cleanup();
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
