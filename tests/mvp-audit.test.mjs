import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const execution = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");

test("dashboard no longer presents the former fictional operation as real", () => {
  for (const fictional of ["Casamento Silva", "Rafael S.", "Carla M.", "92%"]) {
    assert.doesNotMatch(home, new RegExp(fictional.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(home, /checklist_executions/);
  assert.match(home, /non_conformities/);
});

test("execution waits for persistence and blocks duplicate critical actions", () => {
  assert.match(execution, /savingItems\.length > 0/);
  assert.match(execution, /actionLock\.current/);
  assert.match(execution, /A resposta não foi persistida/);
  assert.match(execution, /\.select\("id"\)\.maybeSingle\(\)/);
});

test("photo evidence uses the private organization path and persists metadata", () => {
  assert.match(execution, /checkflow-evidence/);
  assert.match(execution, /\$\{assignment\.organization_id\}\/\$\{execution\.id\}\/\$\{itemId\}/);
  assert.match(execution, /\.from\("attachments"\)\.insert/);
  assert.match(execution, /file\.size > 10 \* 1024 \* 1024/);
  assert.match(execution, /image\/jpeg/);
  assert.match(execution, /createSignedUrl/);
});
