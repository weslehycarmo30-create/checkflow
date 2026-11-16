/** Pure row builders for duplicating a checklist structure. Shared by the detail screen and Node tests. */

export const DUPLICATED_ITEM_FIELDS = [
  "prompt",
  "answer_type",
  "position",
  "required",
  "allow_not_applicable",
  "options",
  "nonconformity_on_no",
  "require_observation_on_failure",
  "require_photo_on_failure",
];

export const DUPLICATION_SECTION_SELECT = `id,title,position,checklist_items(${DUPLICATED_ITEM_FIELDS.join(",")})`;

export function duplicateName(name) {
  const base = String(name || "").trim() || "Checklist";
  return `Cópia de ${base}`.slice(0, 200);
}

/** A duplicate is always a new, unassigned draft in the same organization. */
export function duplicateChecklistRow(checklist, userId) {
  return {
    organization_id: checklist.organization_id,
    name: duplicateName(checklist.name),
    description: checklist.description ?? null,
    category: checklist.category ?? null,
    status: "draft",
    is_template: false,
    created_by: userId,
  };
}

export function sortedSections(sections) {
  return [...(sections || [])]
    .sort((a, b) => a.position - b.position)
    .map(section => ({ ...section, checklist_items: [...(section.checklist_items || [])].sort((a, b) => a.position - b.position) }));
}

export function duplicateSectionRows(sections, { checklistId, organizationId, userId }) {
  return sortedSections(sections).map((section, position) => ({
    organization_id: organizationId,
    checklist_id: checklistId,
    title: section.title,
    position,
    created_by: userId,
  }));
}

/** @param {Map<number,string>} sectionIdsByPosition new section ids keyed by their (re-numbered) position */
export function duplicateItemRows(sections, sectionIdsByPosition, { organizationId, userId }) {
  return sortedSections(sections).flatMap((section, sectionPosition) => {
    const sectionId = sectionIdsByPosition.get(sectionPosition);
    if (!sectionId) throw new Error("Não foi possível associar os itens às seções copiadas.");
    return section.checklist_items.map((item, position) => {
      const row = { organization_id: organizationId, section_id: sectionId, created_by: userId };
      for (const field of DUPLICATED_ITEM_FIELDS) if (item[field] !== undefined) row[field] = item[field];
      row.position = position;
      return row;
    });
  });
}

export function countItems(sections) {
  return (sections || []).reduce((total, section) => total + (section.checklist_items?.length || 0), 0);
}
