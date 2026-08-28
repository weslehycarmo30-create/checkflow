import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const vinext = resolve(root, "node_modules/vinext/dist/cli.js");
const node = process.execPath;
const child = spawn(node, [vinext, "build"], { cwd: root, stdio: "inherit", env: { ...process.env, SITES_ENV_READY: "1", SITES_PROJECT_ROOT: root } });
const timer = setTimeout(() => child.kill(), 180_000);
const code = await new Promise(resolveExit => child.on("exit", (exitCode, signal) => resolveExit(exitCode ?? (signal ? 1 : 0))));
clearTimeout(timer);
if (code !== 0) process.exit(code);

const workerPath = resolve(root, "dist/server/index.js");
const hostingPath = resolve(root, "dist/.openai/hosting.json");
JSON.parse(await readFile(hostingPath, "utf8"));
const worker = await import(`${pathToFileURL(workerPath).href}?sites-validation=${process.pid}-${Date.now()}`);
if (!worker.default || typeof worker.default.fetch !== "function") throw new Error("dist/server/index.js must have an ESM default export with fetch(request, env, ctx)");
console.log("Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.");
