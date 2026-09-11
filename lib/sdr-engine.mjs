export const SDR_STAGES = [
  "RAW LEAD", "LEAD PESQUISADO", "SDR QUALIFIED", "CONTATO FEITO", "DEMO AGENDADA",
  "DEMO REALIZADA", "PROPOSTA ENVIADA", "PILOTO ATIVO", "CLIENTE PAGO", "LOST",
];

export const ACTIVITY_TYPES = ["ligação", "WhatsApp", "Instagram", "e-mail", "reunião", "visita"];
export const CSV_ALIASES = { company_name:["company_name","company"], segmento:["segmento","segment"], cidade:["cidade","city"], telefone:["telefone","phone"], tamanho_equipe:["tamanho_equipe","operation_size_estimate"], origem:["origem","source"], observacoes:["observacoes","notes"], stage:["stage","status"] };

const text = value => String(value || "").trim();
const normalized = value => text(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const digits = value => text(value).replace(/\D/g, "");

export function domainFromEmail(email) {
  const value = normalized(email);
  const at = value.lastIndexOf("@");
  return at > 0 ? value.slice(at + 1) : "";
}

export function calculateScore(prospect) {
  let score = 0;
  if (text(prospect.company_name)) score += 10;
  if (text(prospect.cidade)) score += 10;
  if (text(prospect.segmento)) score += 15;
  if (text(prospect.whatsapp) || text(prospect.telefone)) score += 15;
  if (text(prospect.instagram) || text(prospect.email)) score += 10;
  const team = Number(prospect.tamanho_equipe || 0);
  if (team >= 20) score += 20;
  else if (team >= 8) score += 15;
  else if (team >= 3) score += 8;
  if (/(bar|restaur|evento|buffet|cozinh)/.test(normalized(prospect.segmento))) score += 10;
  if (text(prospect.campanha) || text(prospect.coorte)) score += 5;
  if (normalized(prospect.origem) === "indicação") score += 5;
  return Math.min(100, score);
}

export function tierForScore(score) {
  return score >= 85 ? "HOT" : score >= 60 ? "WARM" : "COLD";
}

export function normalizeImportRow(row) {
  const result = { ...row };
  for (const [target, aliases] of Object.entries(CSV_ALIASES)) for (const alias of aliases) if (!text(result[target]) && text(row[alias])) { result[target] = row[alias]; break; }
  result.research_score = text(row.research_score) || text(row.score);
  result.research_tier = text(row.research_tier) || text(row.tier);
  return result;
}
export function researchTier(score, tier) { return text(tier) || (Number.isFinite(Number(score)) ? tierForScore(Number(score)) : ""); }

export function findDuplicate(incoming, prospects) {
  const emailDomain = domainFromEmail(incoming.email);
  const phone = digits(incoming.whatsapp || incoming.telefone);
  const instagram = normalized(incoming.instagram).replace(/^@/, "");
  const nameCity = `${normalized(incoming.company_name)}|${normalized(incoming.cidade)}`;
  for (const prospect of prospects) {
    if (emailDomain && emailDomain === domainFromEmail(prospect.email)) return { prospect, reason: "domínio" };
  }
  for (const prospect of prospects) {
    if (phone && phone === digits(prospect.whatsapp || prospect.telefone)) return { prospect, reason: "telefone" };
  }
  for (const prospect of prospects) {
    if (instagram && instagram === normalized(prospect.instagram).replace(/^@/, "")) return { prospect, reason: "Instagram" };
  }
  for (const prospect of prospects) {
    if (nameCity !== "|" && nameCity === `${normalized(prospect.company_name)}|${normalized(prospect.cidade)}`) return { prospect, reason: "nome + cidade" };
  }
  return null;
}

export function enrichProspect(input, now = new Date().toISOString()) {
  const normalizedInput = normalizeImportRow(input);
  const readiness_score = calculateScore(normalizedInput);
  const importedResearch = text(normalizedInput.research_score);
  const research_score = importedResearch && Number.isFinite(Number(importedResearch)) ? Number(importedResearch) : undefined;
  const research_tier = researchTier(research_score, normalizedInput.research_tier);
  return {
    id: normalizedInput.id || crypto.randomUUID(), company_name: text(normalizedInput.company_name), instagram: text(normalizedInput.instagram),
    whatsapp: text(normalizedInput.whatsapp), telefone: text(normalizedInput.telefone), email: text(normalizedInput.email), cidade: text(normalizedInput.cidade),
    segmento: text(normalizedInput.segmento), tamanho_equipe: Number(normalizedInput.tamanho_equipe || 0), origem: text(normalizedInput.origem),
    campanha: text(normalizedInput.campanha), coorte: text(normalizedInput.coorte), observacoes: text(normalizedInput.observacoes),
    readiness_score, readiness_tier:tierForScore(readiness_score), research_score, research_tier,
    stage: normalizedInput.stage || "RAW LEAD", created_at: normalizedInput.created_at || now,
    updated_at: now, timeline: Array.isArray(normalizedInput.timeline) ? normalizedInput.timeline : [], expected_revenue: Number(normalizedInput.expected_revenue || 0),
  };
}

export function importProspects(rows, existing = [], { dryRun = true } = {}) {
  const imported = [], conflicts = [], working = [...existing];
  for (let index = 0; index < rows.length; index++) {
    const candidate = enrichProspect(rows[index]);
    if (!candidate.company_name) { conflicts.push({ row: index + 2, reason: "company_name obrigatório" }); continue; }
    const duplicate = findDuplicate(candidate, working);
    if (duplicate) {
      const updateAvailable = candidate.research_score !== undefined && (candidate.research_score !== duplicate.prospect.research_score || candidate.research_tier !== duplicate.prospect.research_tier);
      conflicts.push({ row:index+2, reason:duplicate.reason, duplicate:duplicate.prospect.company_name, duplicateId:duplicate.prospect.id, updateAvailable, candidate }); continue;
    }
    imported.push(candidate); working.push(candidate);
  }
  return { dryRun, imported, conflicts, total: rows.length };
}

export function parseCsv(input) {
  const lines = String(input || "").trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const parseLine = line => {
    const cells = []; let cell = "", quote = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"' && line[i + 1] === '"') { cell += '"'; i++; }
      else if (line[i] === '"') quote = !quote;
      else if (line[i] === "," && !quote) { cells.push(cell.trim()); cell = ""; }
      else cell += line[i];
    }
    cells.push(cell.trim()); return cells;
  };
  const headers = parseLine(lines[0]).map(header => normalized(header));
  return lines.slice(1).map(line => Object.fromEntries(parseLine(line).map((value, index) => [headers[index], value])));
}
