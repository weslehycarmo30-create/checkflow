import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  countItems,
  DUPLICATION_SECTION_SELECT,
  duplicateChecklistRow,
  duplicateItemRows,
  duplicateName,
  duplicateSectionRows,
} from "../lib/checklist-duplication.mjs";

const detail = await readFile(new URL("../app/checklists/[id]/checklist-detail.tsx", import.meta.url), "utf8");
const source = { id: "src", organization_id: "org", name: "Abertura do bar", description: "Turno da noite", category: "Bar", status: "active", created_by: "someone-else" };
const sections = [
  { id: "s2", title: "Liberação", position: 5, checklist_items: [
    { prompt: "Responsável", answer_type: "short_text", position: 0, required: true, allow_not_applicable: false, options: [], nonconformity_on_no: false, require_observation_on_failure: false, require_photo_on_failure: false },
  ] },
  { id: "s1", title: "Segurança", position: 1, checklist_items: [
    { prompt: "Extintor ok?", answer_type: "yes_no", position: 3, required: true, allow_not_applicable: false, options: [], nonconformity_on_no: true, require_observation_on_failure: true, require_photo_on_failure: true },
    { prompt: "Piso seco?", answer_type: "yes_no", position: 1, required: false, allow_not_applicable: true, options: [], nonconformity_on_no: true, require_observation_on_failure: true, require_photo_on_failure: false },
  ] },
];
const scope = { checklistId: "new", organizationId: "org", userId: "me" };

test("duplicate is a new unassigned draft owned by the current user in the same organization", () => {
  const row = duplicateChecklistRow(source, "me");
  assert.deepEqual(row, { organization_id: "org", name: "Cópia de Abertura do bar", description: "Turno da noite", category: "Bar", status: "draft", is_template: false, created_by: "me" });
  assert.equal("id" in row, false);
  assert.equal(duplicateName("  "), "Cópia de Checklist");
  assert.ok(duplicateName("x".repeat(500)).length <= 200);
});

test("sections keep their order and are renumbered from zero", () => {
  assert.deepEqual(duplicateSectionRows(sections, scope), [
    { organization_id: "org", checklist_id: "new", title: "Segurança", position: 0, created_by: "me" },
    { organization_id: "org", checklist_id: "new", title: "Liberação", position: 1, created_by: "me" },
  ]);
});

test("items keep every execution rule, follow the new sections and never carry source ids", () => {
  const rows = duplicateItemRows(sections, new Map([[0, "n1"], [1, "n2"]]), scope);
  assert.equal(rows.length, countItems(sections));
  assert.deepEqual(rows.map(row => [row.section_id, row.position, row.prompt]), [["n1", 0, "Piso seco?"], ["n1", 1, "Extintor ok?"], ["n2", 0, "Responsável"]]);
  const extintor = rows[1];
  assert.equal(extintor.nonconformity_on_no, true);
  assert.equal(extintor.require_photo_on_failure, true);
  assert.equal(rows[0].allow_not_applicable, true);
  for (const row of rows) {
    assert.equal(row.organization_id, "org");
    assert.equal(row.created_by, "me");
    assert.equal("id" in row, false);
  }
});

test("item rows fail loudly when a copied section id is missing", () => {
  assert.throws(() => duplicateItemRows(sections, new Map([[0, "n1"]]), scope), /seções copiadas/);
});

test("detail screen duplicates from the database structure and only for managers", () => {
  assert.match(DUPLICATION_SECTION_SELECT, /require_photo_on_failure/);
  assert.match(detail, /\.select\(DUPLICATION_SECTION_SELECT\)/);
  assert.match(detail, /savedItems\.length !== countItems\(sourceSections\)/);
  assert.match(detail, /\{canManage&&<div className="detail-header-actions"><button className="secondary" disabled=\{busy\} onClick=\{duplicateChecklist\}/);
  assert.match(detail, /if \(!checklist \|\| !userId \|\| !beginAction\(\)\) return;/);
});

test("locked structure points managers to duplication", () => {
  assert.match(detail, /\{structureLockReason\} Para mudar a estrutura, use Duplicar e edite o rascunho\./);
});
