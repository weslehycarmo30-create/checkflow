/** Pure operational state rules shared by the mobile execution screen and Node tests. */
export function isAnswered(value) {
  return value !== undefined && value !== null && value !== "";
}

export function executionProgress(items, answers) {
  if (!items.length) return 0;
  return Math.round(items.filter(item => isAnswered(answers[item.id])).length / items.length * 100);
}

export function requiredExecutionItems(items, answers, observations, nonConformityItems) {
  return items.filter(item => {
    if (!item.required) return false;
    const value = answers[item.id];
    if (!isAnswered(value)) return true;
    return item.answer_type === "yes_no" && value === "Não" &&
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
