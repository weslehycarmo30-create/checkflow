import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const execution = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");
const detail = await readFile(new URL("../app/checklists/[id]/checklist-detail.tsx", import.meta.url), "utf8");

test("rating 0–10 persists numeric answers and treats zero as answered", () => {
  assert.match(execution, /aria-label=\"Avaliação de 0 a 10\"/);
  assert.match(execution, /nextValue===\"\"\?null:Number\(nextValue\)/);
  assert.match(execution, /value !== undefined && value !== null && value !== \"\"/);
  assert.match(execution, /Array\.from\(\{length:11\}/);
  assert.match(execution, /execution_answers\"\)\.upsert/);
});

test("draft item editing is restricted before assignments or executions", () => {
  assert.match(detail, /checklist\?\.status === \"draft\" && !hasExecution && assignments\.length === 0/);
  assert.match(detail, /from\(\"checklist_executions\"\)/);
  assert.match(detail, /from\(\"checklist_items\"\)\.update/);
  assert.match(detail, /from\(\"checklist_items\"\)\.delete/);
  assert.match(detail, /if \(!prompt \|\| !checklist \|\| !section \|\| !canEditStructure/);
  assert.match(detail, /if \(!checklist \|\| !canEditStructure/);
  assert.match(detail, /Item atualizado/);
  assert.match(detail, /Item removido/);
});
