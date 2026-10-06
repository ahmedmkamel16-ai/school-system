export function buildWhatsAppLink(phone: string, message: string): string {
  const digitsOnly = phone.replace(/[^\d]/g, '').replace(/^0+/, '')
  return `https://wa.me/${digitsOnly}?text=${encodeURIComponent(message)}`
}
