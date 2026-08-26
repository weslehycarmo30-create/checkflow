import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("../supabase/migrations/202608260002_execution_historical_snapshot.sql", import.meta.url), "utf8");
const history = await readFile(new URL("../app/history/[executionId]/execution-history-detail.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

test("completed execution snapshots and protected records are installed", () => {
  assert.match(migration, /add column if not exists execution_snapshot jsonb/);
  assert.match(migration, /capture_and_protect_execution_snapshot/);
  assert.match(migration, /build_execution_snapshot/);
  assert.match(migration, /Registros da execução concluída são imutáveis/);
  assert.match(migration, /Os termos do plano de ação histórico são imutáveis/);
});

test("historical screens read the immutable snapshot instead of the live checklist model", () => {
  assert.match(history, /execution_snapshot/);
  assert.match(history, /Registro histórico legado sem snapshot imutável/);
  assert.doesNotMatch(history, /\.from\("checklists"\)/);
  assert.doesNotMatch(history, /\.from\("checklist_sections"\)/);
  assert.match(dashboard, /execution_snapshot/);
  assert.match(dashboard, /Registro legado sem snapshot/);
});
