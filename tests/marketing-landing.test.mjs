import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildQualifiedSalesWhatsAppUrl, getSalesWhatsAppUrl } from "../lib/sales-contact.ts";

const landing = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const auth = await readFile(new URL("../app/auth/page.tsx", import.meta.url), "utf8");

test("public landing presents the pilot and only supported operational capabilities", () => {
  assert.match(landing, /Sua operação sob controle/);
  assert.match(landing, /Começar meu piloto/);
  assert.match(landing, /Ver o CheckFlow em ação/);
  assert.match(landing, /href="#demonstracao"/);
  assert.match(landing, /Veja o CheckFlow em ação/);
  assert.match(landing, /VÍDEO EM PREPARAÇÃO/);
  assert.match(landing, /Continuar explorando/);
  assert.doesNotMatch(landing, /A demonstração em vídeo terá cerca de 30–45 segundos/);
  assert.match(landing, /controls playsInline preload="metadata" poster={demoVideoPoster}/);
  assert.match(landing, /role="dialog" aria-modal="true"/);
  assert.match(landing, /event\.key === "Escape"/);
  assert.match(landing, /Não conformidades/);
  assert.match(landing, /plano de ação/i);
  assert.match(landing, /Acompanhamento e histórico/);
  assert.match(landing, /testa durante 14 dias/);
  assert.match(landing, />14 dias</);
  assert.match(landing, /1 organização/);
  assert.match(landing, /até 48 horas/);
  assert.doesNotMatch(landing, /15 dias/i);
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
  assert.match(landing, /<button className="marketing-button primary" type="button" onClick={onOpen}>Começar meu piloto/);
  assert.match(landing, /marketing-button-unavailable/);
  assert.match(contact, /https:\/\/wa\.me/);
  assert.match(contact, /encodeURIComponent\(pilotMessage\)/);
  assert.match(contact, /piloto de 14 dias/);
  assert.doesNotMatch(contact, /15 dias/i);
  assert.equal(getSalesWhatsAppUrl(undefined), null);
  assert.equal(getSalesWhatsAppUrl(""), null);
  assert.equal(getSalesWhatsAppUrl("123"), null);
  const message = "Olá! Quero conhecer o CheckFlow e entender como funciona o piloto de 14 dias para minha operação.";
  const expected = `https://wa.me/5561986428650?text=${encodeURIComponent(message)}`;
  assert.equal(getSalesWhatsAppUrl("5561986428650"), expected);
  assert.equal(getSalesWhatsAppUrl("+55 (61) 98642-8650"), expected);
  assert.equal(new URL(expected).searchParams.get("text"), message);
  assert.match(landing, /buildQualifiedSalesWhatsAppUrl/);
  assert.match(landing, /window\.open\(url, "_blank", "noopener,noreferrer"\)/);
  assert.match(landing, /maxLength=\{180\}/);
  assert.equal((landing.match(/<PilotCta /g) ?? []).length, 1);
  assert.match(landing, /href="#como-funciona"/);
  assert.match(landing, /href="\/auth"/);
  assert.doesNotMatch(landing, /href="#"/);
});

test("qualification stays local and safely encodes the commercial WhatsApp message", () => {
  const qualification = { name: "Ana\nSilva", company: "Café & Co", operation: "Restaurante", process: "Abertura & higiene" };
  const url = buildQualifiedSalesWhatsAppUrl("+55 (61) 98642-8650", qualification);
  assert.ok(url);
  const message = new URL(url).searchParams.get("text");
  assert.match(message, /Nome: Ana Silva/);
  assert.match(message, /Empresa: Café & Co/);
  assert.match(message, /Primeiro processo: Abertura & higiene/);
  assert.equal(buildQualifiedSalesWhatsAppUrl("5561986428650", { ...qualification, process: " " }), null);
  assert.equal(buildQualifiedSalesWhatsAppUrl(undefined, qualification), null);
  assert.doesNotMatch(landing, /fetch\(|supabase|insert\(/i);
});
