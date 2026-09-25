const pilotMessage = "Olá! Quero conhecer o CheckFlow e entender como funciona o piloto de 14 dias para minha operação.";

export function getSalesWhatsAppUrl(configuredNumber: string | undefined): string | null {
  const number = configuredNumber?.replace(/\D/g, "") ?? "";
  if (!/^\d{8,15}$/.test(number)) return null;

  return `https://wa.me/${number}?text=${encodeURIComponent(pilotMessage)}`;
}
