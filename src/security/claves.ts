function bytesABase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ABytes(valor: string): Uint8Array {
  const bin = atob(valor);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function igualEnTiempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function hashContrasena(contrasena: string, iteraciones: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await derivar(contrasena, salt, iteraciones);
  return `pbkdf2-sha256$${iteraciones}$${bytesABase64(salt)}$${bytesABase64(new Uint8Array(bits))}`;
}

export async function verificarContrasena(contrasena: string, almacenado: string): Promise<boolean> {
  const partes = almacenado.split("$");
  if (partes.length !== 4 || partes[0] !== "pbkdf2-sha256") return false;
  const iteraciones = Number(partes[1]);
  if (!Number.isInteger(iteraciones) || iteraciones < 1 || iteraciones > 2_000_000) return false;
  const salt = base64ABytes(partes[2]);
  const esperado = base64ABytes(partes[3]);
  const bits = await derivar(contrasena, salt, iteraciones);
  return igualEnTiempoConstante(new Uint8Array(bits), esperado);
}

async function derivar(contrasena: string, salt: Uint8Array, iteraciones: number): Promise<ArrayBuffer> {
  const clave = await crypto.subtle.importKey("raw", new TextEncoder().encode(contrasena), "PBKDF2", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iteraciones },
    clave,
    256,
  );
}

export function tokenUrl(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function sha256Hex(valor: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(valor));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function iteracionesDeEntorno(valor: string | undefined): number {
  const n = Number(valor ?? "100000");
  if (!Number.isInteger(n) || n < 1000 || n > 1_000_000) return 100_000;
  return n;
}

export function contrasenaAceptable(valor: string): boolean {
  if (valor.length < 12 || valor.length > 128) return false;
  return /[a-z]/.test(valor) && /[A-Z]/.test(valor) && /\d/.test(valor);
}
