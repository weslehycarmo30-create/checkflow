import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const readProjectFile = path => readFile(new URL(path, root), "utf8");

function pngDimensions(buffer) {
  assert.equal(buffer.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "asset must be a PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test("PWA manifest declares a standalone CheckFlow with install-size icons", async () => {
  const manifest = JSON.parse(await readProjectFile("public/manifest.webmanifest"));
  assert.equal(manifest.name, "CheckFlow");
  assert.equal(manifest.short_name, "CheckFlow");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.prefer_related_applications, false);

  for (const size of [192, 512]) {
    const icon = manifest.icons.find(entry => entry.sizes === `${size}x${size}`);
    assert.ok(icon, `manifest must include a ${size}x${size} icon`);
    assert.equal(icon.type, "image/png");
    const buffer = await readFile(new URL(`public${icon.src}`, root));
    assert.deepEqual(pngDimensions(buffer), { width: size, height: size });
  }
});

test("iOS touch icon and web manifest are linked in application metadata", async () => {
  const layout = await readProjectFile("app/layout.tsx");
  const manifest = await readProjectFile("public/manifest.webmanifest");
  assert.match(layout, /manifest:\s*"\/manifest\.webmanifest"/);
  assert.match(layout, /apple:\s*\[\{\s*url:\s*"\/brand\/checkflow-apple-180\.png"/);
  assert.match(layout, /appleWebApp:\s*\{\s*capable:\s*true/);
  assert.match(manifest, /"background_color":\s*"#[0-9a-f]{6}"/i);
  assert.match(manifest, /"theme_color":\s*"#[0-9a-f]{6}"/i);
  assert.deepEqual(pngDimensions(await readFile(new URL("public/brand/checkflow-apple-180.png", root))), { width: 180, height: 180 });
});

test("install CTA handles browser prompt, already-installed state, and iOS guidance", async () => {
  const cta = await readProjectFile("components/install-app-cta.tsx");
  const landing = await readProjectFile("app/page.tsx");
  assert.match(cta, /beforeinstallprompt/);
  assert.match(cta, /preventDefault\(\)/);
  assert.match(cta, /promptEvent\.prompt\(\)/);
  assert.match(cta, /appinstalled/);
  assert.match(cta, /getInstalledRelatedApps/);
  assert.match(cta, /display-mode: standalone/);
  assert.match(cta, /Compartilhar/);
  assert.match(cta, /Adicionar à Tela de Início/);
  assert.match(landing, /<InstallAppCta\s*\/>/);
  assert.match(landing, /Começar meu piloto/);
});

test("service worker only passes same-origin GET requests to network without caching", async () => {
  const serviceWorker = await readProjectFile("public/sw.js");
  const registration = await readProjectFile("components/register-service-worker.tsx");
  assert.match(serviceWorker, /request\.method\s*!==\s*"GET"/);
  assert.match(serviceWorker, /requestUrl\.origin\s*!==\s*self\.location\.origin/);
  assert.match(serviceWorker, /event\.respondWith\(fetch\(event\.request\)\)/);
  assert.doesNotMatch(serviceWorker, /caches\.|CacheStorage|cache\.put|cache\.add/i);
  assert.match(registration, /register\("\/sw\.js"/);
  assert.match(registration, /updateViaCache:\s*"none"/);
  assert.match(registration, /registration\.update\(\)/);
});

test("PWA assets are present under the public root", async () => {
  for (const path of [
    "public/manifest.webmanifest",
    "public/sw.js",
    "public/brand/checkflow-pwa-192.png",
    "public/brand/checkflow-pwa-512.png",
    "public/brand/checkflow-apple-180.png",
  ]) {
    assert.ok((await stat(new URL(path, root))).isFile(), `${path} must be a file`);
  }
});
