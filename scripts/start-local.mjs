import { createReadStream, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const buildDirectory = resolve(root, "dist");
const runtimeDirectory = await fs.mkdtemp(join(tmpdir(), "checkflow-local-runtime-"));
await fs.cp(buildDirectory, runtimeDirectory, { recursive: true });
const clientDirectory = resolve(runtimeDirectory, "client");
const serverEntry = pathToFileURL(resolve(runtimeDirectory, "server", "index.js")).href;
const buildManifest = await fs.readFile(resolve(runtimeDirectory, "server", "__vite_rsc_assets_manifest.js"));
const buildId = createHash("sha256").update(buildManifest).digest("hex").slice(0, 16);
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "127.0.0.1";
const contentTypes = {
  ".css": "text/css; charset=utf-8", ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8", ".svg": "image/svg+xml",
  ".woff2": "font/woff2", ".json": "application/json; charset=utf-8",
};

async function staticFile(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch { return null; }
  const candidate = resolve(clientDirectory, `.${decoded}`);
  if (!candidate.startsWith(`${clientDirectory}${sep}`)) return null;
  try {
    const stat = await fs.stat(candidate);
    return stat.isFile() ? candidate : null;
  } catch { return null; }
}

const { default: handler } = await import(serverEntry);
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  const file = await staticFile(url.pathname);
  if (file) {
    const type = contentTypes[extname(file)] ?? "application/octet-stream";
    response.writeHead(200, {
      "Content-Type": type,
      "Content-Length": (await fs.stat(file)).size,
      "Cache-Control": url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "public, max-age=3600",
      "X-CheckFlow-Local-Build": buildId,
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(file).pipe(response);
    return;
  }

  try {
    const method = request.method ?? "GET";
    const webRequest = new Request(url, {
      method,
      headers: request.headers,
      body: method === "GET" || method === "HEAD" ? undefined : Readable.toWeb(request),
      duplex: "half",
    });
    const result = typeof handler.fetch === "function"
      ? await handler.fetch(webRequest, undefined, { waitUntil() {}, passThroughOnException() {} })
      : await handler(webRequest);
    const headers = Object.fromEntries(result.headers.entries());
    response.writeHead(result.status, { ...headers, "X-CheckFlow-Local-Build": buildId });
    if (!result.body || method === "HEAD") response.end();
    else Readable.fromWeb(result.body).pipe(response);
  } catch (error) {
    console.error("[checkflow-local] application request failed", error instanceof Error ? error.message : error);
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Internal Server Error");
  }
});

server.listen(port, host, () => {
  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;
  console.log(`CheckFlow local production server running at http://${host}:${resolvedPort}`);
});
