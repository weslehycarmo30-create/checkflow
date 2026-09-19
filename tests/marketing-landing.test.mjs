import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const landing = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const auth = await readFile(new URL("../app/auth/page.tsx", import.meta.url), "utf8");

test("public landing presents the pilot and only supported operational capabilities", () => {
  assert.match(landing, /Sua operação sob controle/);
  assert.match(landing, /Começar meu piloto/);
  assert.match(landing, /Não conformidades/);
  assert.match(landing, /plano de ação/i);
  assert.match(landing, /Histórico de execuções/);
  assert.match(landing, /testa durante 15 dias/);
  assert.match(landing, />15 dias</);
  assert.doesNotMatch(landing, /14 dias/i);
  assert.doesNotMatch(landing, /inteligência artificial|offline completo|QR Code|integrações/i);
});

test("root is public while app entry remains protected at dashboard", () => {
  assert.doesNotMatch(landing, /PrivateRouteGuard/);
  assert.match(dashboard, /PrivateRouteGuard/);
  assert.match(auth, /window\.location\.replace\("\/dashboard"\)/);
});

test("pilot contact uses a valid configured WhatsApp destination or an explicit safe fallback", async () => {
  const contact = await readFile(new URL("../lib/sales-contact.ts", import.meta.url), "utf8");
  assert.match(landing, /NEXT_PUBLIC_CHECKFLOW_SALES_WHATSAPP/);
  assert.match(landing, /canal comercial ainda não está configurado/);
  assert.match(contact, /https:\/\/wa\.me/);
  assert.match(contact, /encodeURIComponent\(pilotMessage\)/);
  assert.match(contact, /piloto de 15 dias/);
  assert.doesNotMatch(contact, /14 dias/i);
});
