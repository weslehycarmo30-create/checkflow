#!/usr/bin/env node
/** Future staging-only HTTP smoke. Requires an explicit HTTPS target; no default URL exists. */
const target = process.argv.find(value => value.startsWith("--target="))?.slice(9);
const expectedRef = "fzmzrtthmciaisygajba";
if (!target) { console.log("STAGING SMOKE: READY (no target supplied; no network requested)"); process.exit(0); }
if (!/^https:\/\//.test(target)) throw new Error("target must be explicit HTTPS staging URL");
const forbidden = /(localhost|127\.0\.0\.1|service_role|SUPABASE_SERVICE_ROLE|eyJ[a-zA-Z0-9_-]{20,})/i;
const routes = ["/", "/auth", "/api/supabase-config"];
const failures = [];
for (const route of routes) {
  const response = await fetch(new URL(route, target)); const text = await response.text();
  if (!response.ok) failures.push(`${route}: HTTP ${response.status}`);
  if (forbidden.test(text)) failures.push(`${route}: forbidden local/secret marker exposed`);
  if (route === "/api/supabase-config" && !text.includes(expectedRef)) failures.push(`${route}: expected Supabase project ref absent`);
  const assets = [...text.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css|woff2?))["']/g)].map(match => match[1]);
  for (const asset of assets) { const assetResponse = await fetch(new URL(asset, target)); if (!assetResponse.ok) failures.push(`${asset}: HTTP ${assetResponse.status}`); }
}
if (failures.length) { console.error(`STAGING SMOKE: FAIL\n${failures.join("\n")}`); process.exitCode = 1; } else console.log("STAGING SMOKE: PASS — unauthenticated HTTP/assets/config checks only; authenticated browser flows remain HUMAN CANARY.");
