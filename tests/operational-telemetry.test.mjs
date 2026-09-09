import assert from "node:assert/strict";
import test from "node:test";
import { operationalFailure, safeOperationalMessage } from "../lib/operational-telemetry.mjs";
import { readFile } from "node:fs/promises";

const execution = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");

test("operational incident evidence contains only diagnostic identifiers and no raw error message", () => {
  const original = console.warn;
  let logged;
  console.warn = (_label, value) => { logged = value; };
  try {
    const event = operationalFailure({ operation:"save answer", entity:"item", entityId:"item-1", organizationId:"org-1", errorCode:"ANSWER_SAVE_FAILED", error:new Error("private server detail") });
    assert.equal(event.error_code, "ANSWER_SAVE_FAILED");
    assert.equal(event.entity_id, "item-1");
    assert.equal(event.organization_id, "org-1");
    assert.equal(logged.technical_context.error_name, "Error");
    assert.doesNotMatch(JSON.stringify(logged), /private server detail/);
  } finally { console.warn = original; }
});

test("safe UI message exposes a support code without raw technical detail", () => {
  assert.match(safeOperationalMessage("EXECUTION_COMPLETE_FAILED", "concluir o checklist"), /EXECUTION_COMPLETE_FAILED/);
  assert.doesNotMatch(safeOperationalMessage("ANSWER_SAVE_FAILED", "salvar a resposta"), /token|password/i);
});

test("critical execution mutations always release their busy locks after a rejected request", () => {
  for (const operation of ["startExecution", "saveAnswer", "uploadPhoto", "finishExecution"]) {
    const body = execution.slice(execution.indexOf(`const ${operation}`), execution.indexOf("\n  const ", execution.indexOf(`const ${operation}`) + 1));
    assert.match(body, /catch \(error\)/, `${operation} catches rejected requests`);
    assert.match(body, /finally/, `${operation} releases its operational lock`);
  }
});
