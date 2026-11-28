/** Pure aggregation for the basic operational report. Shared by the dashboard and Node tests. */

export const REPORT_PERIODS = [7, 30, 90];
export const LOW_CONFORMITY_THRESHOLD = 80;

// The dashboard loads only the newest executions; one extra row tells whether anything was left out.
export const HISTORY_LIMIT = 50;

/**
 * @template T
 * @param {T[]} rows
 * @param {number} [limit]
 * @returns {{rows: T[], truncated: boolean}}
 */
export function limitHistory(rows, limit = HISTORY_LIMIT) {
  return { rows: rows.slice(0, limit), truncated: rows.length > limit };
}

/** True when the period reaches the oldest loaded row, so older completions may be missing. */
export function reportMayBeIncomplete(history, truncated, { days, now = new Date() }) {
  if (!truncated || !history.length) return false;
  const oldest = Math.min(...history.map(record => new Date(record.completed_at).getTime()));
  return oldest >= now.getTime() - days * 24 * 60 * 60 * 1000;
}

function average(values) {
  if (!values.length) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function groupBy(records, key) {
  const groups = new Map();
  for (const record of records) {
    const name = record[key] || "Sem identificação";
    const group = groups.get(name) || { name, completions: 0, conformities: [], last_completed_at: null };
    group.completions += 1;
    if (record.conformity_percentage !== null && record.conformity_percentage !== undefined) group.conformities.push(Number(record.conformity_percentage));
    if (!group.last_completed_at || record.completed_at > group.last_completed_at) group.last_completed_at = record.completed_at;
    groups.set(name, group);
  }
  return [...groups.values()]
    .map(({ conformities, ...group }) => ({ ...group, average_conformity: average(conformities) }))
    .sort((a, b) => b.completions - a.completions || a.name.localeCompare(b.name, "pt-BR"));
}

/**
 * @param {{id:string,checklist_name:string,executor_name:string,completed_at:string,conformity_percentage:number|null}[]} history
 * @param {{days:number, now?:Date}} options
 */
export function buildOperationalReport(history, { days, now = new Date() }) {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const records = (history || []).filter(record => {
    if (!record?.completed_at) return false;
    const completed = new Date(record.completed_at);
    return !Number.isNaN(completed.getTime()) && completed >= since && completed <= now;
  });
  const conformities = records
    .filter(record => record.conformity_percentage !== null && record.conformity_percentage !== undefined)
    .map(record => Number(record.conformity_percentage));
  return {
    days,
    since: since.toISOString(),
    completions: records.length,
    average_conformity: average(conformities),
    below_threshold: conformities.filter(value => value < LOW_CONFORMITY_THRESHOLD).length,
    by_checklist: groupBy(records, "checklist_name"),
    by_executor: groupBy(records, "executor_name"),
    records,
  };
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  // Neutralize spreadsheet formulas and quote every cell.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function reportToCsv(report) {
  const header = ["Checklist", "Executor", "Concluído em", "Conformidade (%)"];
  const rows = report.records.map(record => [
    record.checklist_name,
    record.executor_name,
    record.completed_at,
    record.conformity_percentage ?? "",
  ]);
  return [header, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
}
