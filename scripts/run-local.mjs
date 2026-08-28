import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRoot = resolve(process.env.SITES_RUNTIME_ROOT || `${projectRoot}/.sites-runtime`);

await Promise.all([
  mkdir(resolve(runtimeRoot, "home"), { recursive: true }),
  mkdir(resolve(runtimeRoot, "npm-cache"), { recursive: true }),
  mkdir(resolve(runtimeRoot, "xdg-config"), { recursive: true }),
  mkdir(resolve(runtimeRoot, "tmp"), { recursive: true }),
  mkdir(resolve(runtimeRoot, "wrangler/logs"), { recursive: true }),
]);

const commandArgs = process.argv.slice(2);
if (commandArgs[0] === "--") commandArgs.shift();
const [command, ...args] = commandArgs;
if (!command) {
  console.error("usage: node scripts/run-local.mjs -- command [args...]");
  process.exit(64);
}

const env = {
  ...process.env,
  SITES_ENV_READY: "1",
  SITES_PROJECT_ROOT: projectRoot,
  HOME: resolve(runtimeRoot, "home"),
  XDG_CONFIG_HOME: resolve(runtimeRoot, "xdg-config"),
  TMPDIR: resolve(runtimeRoot, "tmp"),
  WRANGLER_WRITE_LOGS: "false",
  WRANGLER_LOG_PATH: resolve(runtimeRoot, "wrangler/logs"),
  MINIFLARE_REGISTRY_PATH: resolve(runtimeRoot, "wrangler/registry"),
  npm_config_cache: resolve(runtimeRoot, "npm-cache"),
  npm_config_audit: "false",
  npm_config_fund: "false",
  npm_config_update_notifier: "false",
};

for (const key of ["npm_config_proxy", "npm_config_http_proxy", "npm_config_https_proxy", "NPM_CONFIG_PROXY", "NPM_CONFIG_HTTP_PROXY", "NPM_CONFIG_HTTPS_PROXY"]) {
  delete env[key];
}

const localCommands = {
  eslint: resolve(projectRoot, "node_modules/eslint/bin/eslint.js"),
  "drizzle-kit": resolve(projectRoot, "node_modules/drizzle-kit/bin.cjs"),
};
const localCommand = localCommands[command];
const child = localCommand
  ? spawn(process.execPath, [localCommand, ...args], { cwd: projectRoot, env, stdio: "inherit" })
  : spawn(command, args, { cwd: projectRoot, env, stdio: "inherit", shell: true });
child.on("error", error => {
  console.error(error.message);
  process.exit(1);
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
