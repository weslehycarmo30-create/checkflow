const pilotMessage = "Olá! Quero testar o CheckFlow na minha operação. Gostaria de conhecer o piloto de 15 dias.";

export function getSalesWhatsAppUrl(configuredNumber: string | undefined): string | null {
  const number = configuredNumber?.replace(/\D/g, "") ?? "";
  if (!/^\d{8,15}$/.test(number)) return null;

  return `https://wa.me/${number}?text=${encodeURIComponent(pilotMessage)}`;
}
