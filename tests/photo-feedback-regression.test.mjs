import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
assert.match(css, /\.detail-message\{[^}]*pointer-events:none/, "feedback de fotografia não pode interceptar o CTA de finalização");
assert.match(css, /\.detail-message button\{[^}]*pointer-events:auto/, "fechamento manual continua clicável");
assert.match(css, /bottom:calc\(76px \+ env\(safe-area-inset-bottom\)\)/, "feedback respeita área útil e safe-area mobile");
