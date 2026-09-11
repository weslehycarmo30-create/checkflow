export const SDR_STORAGE_KEY = "checkflow-sdr-v1";

export function loadSdrProspects(storage) {
  let raw;
  try { raw = storage.getItem(SDR_STORAGE_KEY); } catch { return { status: "unavailable", prospects: [] }; }
  if (raw === null) return { status: "empty", prospects: [] };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { status: "invalid", prospects: [] };
    return { status: "loaded", prospects: parsed.filter(value => value && typeof value === "object").map(value => ({ ...value, timeline: Array.isArray(value.timeline) ? value.timeline : [] })) };
  } catch { return { status: "invalid", prospects: [] }; }
}

export function saveSdrProspects(storage, prospects) {
  try { storage.setItem(SDR_STORAGE_KEY, JSON.stringify(prospects)); return { ok: true }; }
  catch { return { ok: false }; }
}
