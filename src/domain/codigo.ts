export function codigoPublico(prefijo: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const limpio = prefijo.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() || "REC";
  return `${limpio}-${hex}`;
}
