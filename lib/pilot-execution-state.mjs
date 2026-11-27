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
// The database captures each section's items under `items` (migration 202608260002); the screen
// works with `checklist_items`, the shape of the live query.
export function executionSectionsFromSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
  const sections = snapshot.sections;
  if (!Array.isArray(sections)) return null;
  const byPosition = (a, b) => (a.position ?? 0) - (b.position ?? 0);
  return sections
    .map(section => ({ ...section, checklist_items: [...(section.items ?? section.checklist_items ?? [])].sort(byPosition) }))
    .sort(byPosition);
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

// The database serialises writes per checklist and fails fast with this code instead of waiting
// (migration 202609070004). The transaction was rolled back, so the same write can be sent again.
export const LOCK_CONFLICT_CODE = "55P03";

/**
 * Runs writes one at a time, in call order; a failed write does not block the next one.
 * @returns {<T>(operation: () => PromiseLike<T>) => Promise<T>}
 */
export function createSerialQueue() {
  let tail = Promise.resolve();
  return operation => {
    const result = tail.then(operation);
    tail = result.then(() => undefined, () => undefined);
    return result;
  };
}

/**
 * Repeats a Supabase write that was refused only because another write held the lock.
 * @template T
 * @param {() => PromiseLike<T>} operation
 * @param {{delays?: number[], wait?: (ms: number) => Promise<unknown>}} [options]
 * @returns {Promise<T>}
 */
export async function retryOnLockConflict(operation, { delays = [250, 600, 1200], wait = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  let result = await operation();
  for (const delay of delays) {
    if (/** @type {{error?: {code?: string}}} */ (result)?.error?.code !== LOCK_CONFLICT_CODE) break;
    await wait(delay);
    result = await operation();
  }
  return result;
}
