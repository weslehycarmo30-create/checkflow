import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/start-local.mjs"], {
      cwd: process.cwd(), env: { ...process.env, PORT: "0" }, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const timeout = setTimeout(() => reject(new Error(`local server did not start: ${output}`)), 15000);
    child.stdout.on("data", chunk => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolve({ child, origin: `http://127.0.0.1:${match[1]}` }); }
    });
    child.stderr.on("data", chunk => { output += chunk; });
    child.on("error", error => { clearTimeout(timeout); reject(error); });
    child.on("exit", code => { if (code && !output.includes("http://")) { clearTimeout(timeout); reject(new Error(output)); } });
  });
}

test("production runtime serves stylesheet and critical JavaScript instead of an HTML fallback", async () => {
  const { child, origin } = await startLocalServer();
  try {
    const root = await fetch(`${origin}/`);
    assert.equal(root.status, 200);
    const buildId = root.headers.get("x-checkflow-local-build");
    assert.match(buildId ?? "", /^[a-f0-9]{16}$/);
    const manifest = await readFile(resolve(process.cwd(), "dist/server/__vite_rsc_assets_manifest.js"));
    const expectedBuildId = createHash("sha256").update(manifest).digest("hex").slice(0, 16);
    assert.equal(buildId, expectedBuildId, "runtime must be a snapshot of the current build manifest");
    const html = await root.text();
    const cssPath = html.match(/<link rel="stylesheet" href="([^"]+)"/)?.[1];
    const jsPath = html.match(/<link rel="modulepreload" href="([^"]+)"/)?.[1];
    assert.ok(cssPath, "root HTML must reference a stylesheet");
    assert.ok(jsPath, "root HTML must preload critical JavaScript");

    const css = await fetch(`${origin}${cssPath}`);
    assert.equal(css.status, 200);
    assert.equal(css.headers.get("x-checkflow-local-build"), buildId);
    assert.match(css.headers.get("content-type") ?? "", /^text\/css/);
    const cssText = await css.text();
    assert.ok(cssText.length > 100);

    // A 200 stylesheet can still be stale or unrelated to the landing. Keep
    // this coupled to distinctive classes rendered by the current homepage.
    for (const className of ["marketing-shell", "marketing-hero", "marketing-preview", "marketing-pilot"]) {
      assert.match(html, new RegExp(`class="[^"]*\\b${className}\\b`));
      assert.match(cssText, new RegExp(`\\.${className}\\{`));
    }

    const js = await fetch(`${origin}${jsPath}`);
    assert.equal(js.status, 200);
    assert.equal(js.headers.get("x-checkflow-local-build"), buildId);
    assert.match(js.headers.get("content-type") ?? "", /javascript/);
    assert.ok((await js.text()).length > 100);
    assert.equal((await fetch(`${origin}/auth`)).status, 200);
    assert.equal((await fetch(`${origin}/dashboard`)).status, 200);
  } finally {
    child.kill();
  }
});
