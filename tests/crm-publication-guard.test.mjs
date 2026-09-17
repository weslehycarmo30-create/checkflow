import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { crmPublicationResponse, isCrmPath } from "../lib/crm-publication-guard.mjs";

async function loadBuiltWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("crm-publication-guard", `${process.pid}-${Date.now()}-${Math.random()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

const context = { waitUntil() {}, passThroughOnException() {} };
const productionEnv = {
  ASSETS: {
    fetch: async () => {
      throw new Error("The CRM route must be blocked before assets or the app handler are reached.");
    },
  },
};

test("development keeps the local CRM route available to Vinext", () => {
  assert.equal(isCrmPath("/crm"), true);
  assert.equal(isCrmPath("/crm/import"), true);
  assert.equal(isCrmPath("/%63rm%2Fimport"), true);
  assert.equal(crmPublicationResponse("/crm", true), null);
  assert.equal(crmPublicationResponse("/", true), null);
});

test("production blocks CRM before it can render SDR content while the product route remains available", async () => {
  const worker = await loadBuiltWorker();
  for (const pathname of ["/crm", "/crm/import", "/%63rm%2Fimport"]) {
    const blocked = await worker.fetch(new Request(`http://localhost${pathname}`), productionEnv, context);
    assert.equal(blocked.status, 404);
    assert.equal(blocked.headers.get("cache-control"), "no-store");
    assert.doesNotMatch(await blocked.text(), /SDR Command Center|CRMFACTORY|prospect/i);
  }

  const home = await worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), productionEnv, context);
  assert.equal(home.status, 200);
  assert.match(home.headers.get("content-type") ?? "", /^text\/html\b/i);
});

test("the tracked source and production artifact contain no versioned prospect dataset", async () => {
  const crmSource = await readFile(new URL("../app/crm/page.tsx", import.meta.url), "utf8");
  const sdrSource = await readFile(new URL("../lib/sdr-engine.mjs", import.meta.url), "utf8");
  const prospectCsv = await readFile(new URL("../docs/commercial/sdr/checkflow_prospects.csv", import.meta.url), "utf8");
  const assetFiles = await readdir(new URL("../dist/client/", import.meta.url), { recursive: true });

  assert.match(crmSource, /useState<Prospect\[\]>\(\[\]\)/);
  assert.doesNotMatch(crmSource, /checkflow_prospects\.csv|from\s+["'][^"']*prospect/i);
  assert.doesNotMatch(sdrSource, /Fênix Eventos e Buffet|Castro's|Bar Aurora/);
  assert.equal(prospectCsv.trim().split(/\r?\n/).length, 2);
  assert.match(prospectCsv, /^UNKNOWN,UNKNOWN,/m);
  assert.ok(assetFiles.every(file => !String(file).includes("checkflow_prospects.csv")));
});
