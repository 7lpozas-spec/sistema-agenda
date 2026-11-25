const CUERPO = /^(\d{1,8})-?([\dkK])$/;

export function limpiarRut(entrada: string): string {
  return entrada.replace(/\./g, "").replace(/\s+/g, "").toUpperCase();
}

export function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

/** Devuelve el RUT normalizado `12345678-9` o null si el dígito no calza. */
export function normalizarRut(entrada: string): string | null {
  const limpio = limpiarRut(entrada);
  const match = CUERPO.exec(limpio);
  if (!match) return null;
  const cuerpo = match[1].replace(/^0+/, "") || "0";
  if (cuerpo.length < 7 || cuerpo.length > 8) return null;
  const dv = match[2].toUpperCase();
  if (digitoVerificador(cuerpo) !== dv) return null;
  return `${cuerpo}-${dv}`;
}

export function formatearRut(normalizado: string): string {
  const [cuerpo, dv] = normalizado.split("-");
  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}-${dv}`;
}

/** En las listas se ocultan los últimos tres dígitos del cuerpo: 12.345.***-9. */
export function enmascararRut(normalizado: string): string {
  const [cuerpo, dv] = normalizado.split("-");
  const visible = cuerpo.slice(0, Math.max(0, cuerpo.length - 3));
  const conPuntos = visible.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${conPuntos}.***-${dv}`;
}
