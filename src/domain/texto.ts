const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function limpiarLinea(valor: string): string {
  return valor.replace(CONTROL, "").replace(/\s+/g, " ").trim();
}

export function limpiarParrafo(valor: string): string {
  return valor
    .replace(CONTROL, "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((linea) => linea.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}

export function correoValido(valor: string): boolean {
  if (valor.length > 120) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);
}

export function telefonoValido(valor: string): boolean {
  const digitos = valor.replace(/[^\d+]/g, "");
  return /^\+?\d{8,12}$/.test(digitos);
}
