// Mayúsculas y sin espacios ni guiones: "abc 123" / "abc-123" -> "ABC123".
export function normalizarPlaca(texto: string | undefined): string {
  return (texto ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// 5 a 7 letras o números cubre carro (ABC123), moto (ABC12D) y otros formatos.
export function esPlacaValida(placa: string): boolean {
  return /^[A-Z0-9]{5,7}$/.test(placa);
}
