import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detail = await readFile(new URL("../app/checklists/[id]/checklist-detail.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
const execution = await readFile(new URL("../app/executions/[assignmentId]/checklist-execution.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202607220001_base_multitenant.sql", import.meta.url), "utf8");
const hardeningMigration = await readFile(new URL("../supabase/migrations/202607230002_hardening_rls_mvp.sql", import.meta.url), "utf8");
const snapshotMigration = await readFile(new URL("../supabase/migrations/202608260002_execution_historical_snapshot.sql", import.meta.url), "utf8");

test("reassigning after a completed execution creates a new assignment", () => {
  assert.match(detail, /from\("checklist_assignments"\)[\s\S]*\.eq\("assigned_to", assignedTo\)[\s\S]*\.eq\("active", true\)/);
  assert.match(detail, /from\("checklist_executions"\)[\s\S]*\.in\("assignment_id", existingIds\)/);
  assert.match(detail, /status === "in_progress" \|\| execution\.status === "paused"/);
  assert.match(detail, /if \(!existing\?\.length \|\| \(!reusedAssignment && !assignmentError\)\)/);
  assert.match(detail, /Nova atribuição criada\./);
});

test("operation renders each active assignment separately and execution is assignment-scoped", () => {
  assert.match(dashboard, /key=\{checklist\.assignment_id\|\|checklist\.id\}/);
  assert.match(dashboard, /assignment_id:assignment\.id/);
  assert.match(dashboard, /latestByAssignment\.set\(execution\.assignment_id,execution\.status\)/);
  assert.match(execution, /\.eq\("assignment_id", assignmentId\)/);
  assert.match(execution, /assignment_id: assignment\.id/);
});

test("a new execution starts empty while completed history stays immutable", () => {
  assert.match(execution, /const \[answers,setAnswers\] = useState<Record<string,AnswerValue>>\(\{\}\)/);
  assert.match(execution, /const progress = items\.length \? Math\.round\(answeredCount \/ items\.length \* 100\) : 0/);
  assert.match(execution, /\.from\("execution_answers"\)[\s\S]*\.select\("item_id,value,observation"\)/);
  assert.match(execution, /\.eq\("execution_id", executionData\.id\)/);
  assert.match(execution, /checklist_executions"\)\.insert\([\s\S]*assignment_id: assignment\.id/);
  assert.match(execution, /checklist_executions"\)\.update\([\s\S]*status: "completed"/);
  assert.match(execution, /\.eq\("id", execution\.id\)/);
  assert.match(dashboard, /historyQuery[\s\S]*\.eq\("status", "completed"\)/);
  assert.match(migration, /unique\(execution_id,item_id\)/);
  assert.doesNotMatch(migration, /unique\(checklist_id,assigned_to\)/);
  assert.match(snapshotMigration, /if old\.status = 'completed' then/);
  assert.match(snapshotMigration, /Uma execução concluída é imutável/);
});

test("tenant isolation remains part of assignment and execution policy", () => {
  assert.match(migration, /organization_id uuid not null references public\.organizations\(id\)/);
  assert.match(hardeningMigration, /a\.organization_id = checklist_executions\.organization_id/);
  assert.match(hardeningMigration, /a\.checklist_id = checklist_executions\.checklist_id/);
  assert.match(hardeningMigration, /a\.assigned_to = auth\.uid\(\)/);
});
