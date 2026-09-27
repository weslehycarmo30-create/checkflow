export type SalesQualification = { name: string; company: string; operation: string; process: string };

const pilotMessage = "Olá! Quero conhecer o CheckFlow e entender como funciona o piloto de 14 dias para minha operação.";
const maxLengths = { name: 60, company: 80, operation: 40, process: 180 };

function salesNumber(configuredNumber: string | undefined) {
  const number = configuredNumber?.replace(/\D/g, "") ?? "";
  return /^\d{8,15}$/.test(number) ? number : null;
}

function clean(value: string, maximum: number) { return value.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim().slice(0, maximum); }

export function getSalesWhatsAppUrl(configuredNumber: string | undefined): string | null {
  const number = salesNumber(configuredNumber);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(pilotMessage)}` : null;
}

export function buildQualifiedSalesWhatsAppUrl(configuredNumber: string | undefined, qualification: SalesQualification): string | null {
  const number = salesNumber(configuredNumber);
  const fields = { name: clean(qualification.name, maxLengths.name), company: clean(qualification.company, maxLengths.company), operation: clean(qualification.operation, maxLengths.operation), process: clean(qualification.process, maxLengths.process) };
  if (!number || Object.values(fields).some(value => !value)) return null;
  const message = `${pilotMessage}\n\nNome: ${fields.name}\nEmpresa: ${fields.company}\nTipo de operação: ${fields.operation}\nPrimeiro processo: ${fields.process}`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
