import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const detail = await readFile(new URL("../app/checklists/[id]/checklist-detail.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/202607220001_base_multitenant.sql", import.meta.url), "utf8");

test("owner/manager can rename an editable section", () => {
  assert.match(detail, /const startSectionEdit/);
  assert.match(detail, /from\("checklist_sections"\)\.update/);
  assert.match(detail, /title: editingSectionTitle\.trim\(\)/);
  assert.match(detail, /aria-label="Nome da seção"/);
  assert.match(detail, /showFeedback\("Seção atualizada\."\)/);
});

test("owner/manager can delete an empty editable section", () => {
  assert.match(detail, /const removeSection/);
  assert.match(detail, /const itemCount = section\.checklist_items\.length/);
  assert.match(detail, /from\("checklist_sections"\)\.delete/);
  assert.match(detail, /showFeedback\("Seção removida\."\)/);
});

test("deleting a section with items requires explicit confirmation", () => {
  assert.match(detail, /itemCount > 0/);
  assert.match(detail, /também serão removidos/);
  assert.match(detail, /window\.confirm\(confirmation\)/);
});

test("section changes are blocked when assignment or protected history exists", () => {
  assert.match(detail, /const canEditStructureBase = canManage && checklist\?\.status === "draft" && !hasExecution && assignments\.length === 0/);
  assert.match(detail, /from\("checklist_executions"\)/);
  assert.match(detail, /currentAssignments.*currentExecutions/);
  assert.match(detail, /histórico protegido/);
  assert.match(detail, /disabled=\{busy\|\|!canEditStructure\}/);
  assert.match(migration, /section_id uuid not null references public\.checklist_sections\(id\) on delete cascade/);
  assert.match(migration, /item_id uuid not null references public\.checklist_items\(id\)/);
});

test("executor cannot edit or delete sections", () => {
  assert.match(detail, /const canManage = role === "owner" \|\| role === "manager"/);
  assert.match(detail, /canManage&&editingSectionId!==section\.id&&<div className="section-actions"/);
  assert.match(detail, /if \(!canEditStructure\) return;/);
});
