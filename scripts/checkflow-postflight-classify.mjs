#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const critical = /^(0[1-7]_.*|.*(?:rls|policy|function|trigger).*)$/i;
const asRows = input => Array.isArray(input) ? input : input.rows || input.data || input.result || [];
export function classify(input) {
  const rows = asRows(input);
  if (!Array.isArray(rows) || !rows.length) return { decision: "NO-GO", reasons: ["postflight has no rows"] };
  const normalized = rows.map(row => ({ report: String(row.report || row.gate || ""), status: String(row.status || "").toUpperCase(), value: String(row.count_or_value ?? row.value ?? "") }));
  const reasons = [];
  for (const row of normalized) {
    if (row.status === "FAIL") reasons.push(`FAIL: ${row.report}`);
    if (critical.test(row.report) && row.status !== "PASS" && row.status !== "INFO") reasons.push(`critical result is not PASS: ${row.report}`);
    if (/legacy_snapshot_preserved/i.test(row.report) && !/legacy=6(?:;|$)/.test(row.value)) reasons.push("legacy snapshot exception is not exactly 6");
    if (/snapshot/i.test(row.report) && !/legacy_snapshot_preserved/i.test(row.report) && /(?:[1-9]\d*)/.test(row.value) && row.status !== "PASS" && row.status !== "INFO") reasons.push(`new or malformed snapshot: ${row.report}`);
    if (/(duplicate.*(?:assignment|execution)|cross_tenant|missing_plan_correction_object)/i.test(row.report) && !/^0(?:\.0+)?$/.test(row.value)) reasons.push(`non-zero integrity violation: ${row.report}=${row.value}`);
  }
  if (reasons.length) return { decision: "NO-GO", reasons };
  const reviews = normalized.filter(row => row.status === "REVIEW" && !/orphan_storage_placeholders/i.test(row.report));
  return reviews.length ? { decision: "REVIEW REQUIRED", reasons: reviews.map(row => `material REVIEW: ${row.report}`) } : { decision: "GO", reasons: ["all required gates PASS; only accepted legacy/storage review may remain"] };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2]; if (!file) throw new Error("usage: node scripts/checkflow-postflight-classify.mjs <postflight.json>");
  const result = classify(JSON.parse(readFileSync(file, "utf8"))); console.log(JSON.stringify(result, null, 2)); process.exitCode = result.decision === "NO-GO" ? 1 : 0;
}
