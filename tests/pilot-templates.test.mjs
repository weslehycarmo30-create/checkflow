import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboard = await readFile(new URL("../app/dashboard/page.tsx", import.meta.url), "utf8");
const templatesSource = dashboard.match(/const templates: ChecklistTemplate\[\] = \[([\s\S]*?)\n\];/)?.[1] ?? "";
const templates = templatesSource.split(/\n  \{\s*\n?\s*emoji:/).slice(1).map(block => ({
  title: block.match(/title:"([^"]+)"/)?.[1],
  items: Number(block.match(/items:(\d+)/)?.[1]),
  prompts: (block.match(/prompt:"/g) ?? []).length,
  hasSections: /sections:\[/.test(block),
}));

test("pilot ships the bar opening, bar closing and buffet templates", () => {
  const titles = templates.map(template => template.title);
  for (const title of ["Abertura do bar", "Fechamento do bar", "Montagem e desmontagem de buffet"]) {
    assert.ok(titles.includes(title), `missing template: ${title}`);
  }
});

test("every pilot template has real sections and its declared item count matches its items", () => {
  assert.ok(templates.length > 0, "templates array not found");
  for (const template of templates) {
    assert.ok(template.hasSections, `${template.title} has no sections`);
    assert.equal(template.prompts, template.items, `${template.title} declares ${template.items} items but has ${template.prompts}`);
  }
});

test("pilot clients never see unconnected templates or the unfinished reports menu", () => {
  assert.match(dashboard, /templates\.filter\(template=>template\.sections\?\.length\)/);
  assert.doesNotMatch(dashboard, /\["Relatórios","chart"\]/);
});
