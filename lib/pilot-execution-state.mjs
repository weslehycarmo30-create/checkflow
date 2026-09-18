/** Pure operational state rules shared by the mobile execution screen and Node tests. */
export function isAnswered(value, answerType) {
  if (answerType === "checkbox") return value === true;
  return value !== undefined && value !== null && value !== "";
}

export function executionProgress(items, answers) {
  if (!items.length) return 0;
  return Math.round(items.filter(item => isAnswered(answers[item.id], item.answer_type)).length / items.length * 100);
}

// An execution is an historical record. Once it exists, its item set must come
// from the server-captured snapshot, never from a subsequently rendered
// checklist definition.
export function executionSectionsFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const sections = snapshot.sections;
  return Array.isArray(sections) ? sections : null;
}

export function requiredExecutionItems(items, answers, observations, nonConformityItems) {
  return items.filter(item => {
    if (!item.required) return false;
    const value = answers[item.id];
    if (!isAnswered(value, item.answer_type)) return true;
    return item.answer_type === "yes_no" && (value === "Não" || value === false) &&
      (!observations[item.id]?.trim() || !nonConformityItems.includes(item.id));
  });
}

export function selectReusableAssignment(assignments, executionsByAssignment) {
  return assignments.find(candidate => {
    const executions = executionsByAssignment.get(candidate.id) || [];
    return executions.length === 0 || executions.some(execution => execution.status === "in_progress" || execution.status === "paused");
  }) || null;
}

export function mutationFailureMessage(persisted, operation) {
  if (persisted) return "A operação foi persistida, mas a atualização da tela falhou. Atualize antes de tentar novamente.";
  return `Não foi possível ${operation.toLowerCase()}. Verifique a conexão e tente novamente.`;
}
