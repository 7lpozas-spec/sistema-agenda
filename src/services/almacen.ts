import { detectarImagen, nombreSeguro, type MimeImagen } from "../domain/imagen";
import { ErrorApp } from "../http/error";

export interface FotoGuardada {
  backend: "drive" | "r2";
  externalId: string;
  mime: MimeImagen;
  nombre: string;
  bytes: number;
}

function pemAPkcs8(pem: string): ArrayBuffer {
  const limpio = pem.replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const binario = atob(limpio);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes.buffer;
}

function b64url(datos: string | ArrayBuffer): string {
  const bytes = typeof datos === "string" ? new TextEncoder().encode(datos) : new Uint8Array(datos);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

let tokenDrive: { valor: string; expira: number } | null = null;
let tokenUsuario: { valor: string; expira: number } | null = null;

async function tokenDeServicio(email: string, pem: string): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  if (tokenDrive && tokenDrive.expira > ahora + 60) return tokenDrive.valor;
  const clave = await crypto.subtle.importKey(
    "pkcs8",
    pemAPkcs8(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encabezado = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: ahora,
      exp: ahora + 3600,
    }),
  );
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", clave, new TextEncoder().encode(`${encabezado}.${cuerpo}`));
  const jwt = `${encabezado}.${cuerpo}.${b64url(firma)}`;
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!respuesta.ok) {
    throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google Drive rechazó la credencial de servicio.");
  }
  const json = (await respuesta.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google Drive no entregó un token.");
  tokenDrive = { valor: json.access_token, expira: ahora + (json.expires_in ?? 3600) };
  return json.access_token;
}

async function tokenDeUsuario(clientId: string, secret: string, refresh: string): Promise<string> {
  const ahora = Math.floor(Date.now() / 1000);
  if (tokenUsuario && tokenUsuario.expira > ahora + 60) return tokenUsuario.valor;
  const respuesta = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: secret,
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  if (!respuesta.ok) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google rechazó el refresh token de la cuenta personal.");
  const json = (await respuesta.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google no entregó un token de acceso.");
  tokenUsuario = { valor: json.access_token, expira: ahora + (json.expires_in ?? 3600) };
  return json.access_token;
}

export function driveListo(env: Env): boolean {
  const carpeta = env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!carpeta) return false;
  if (env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() && env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim()) return true;
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim());
}

async function tokenAcceso(env: Env): Promise<string> {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const secret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refresh = env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (clientId && secret && refresh) return tokenDeUsuario(clientId, secret, refresh);
  const cred = credencialesDrive(env);
  if (!cred) throw new ErrorApp(503, "DRIVE_SIN_CONFIGURAR", "Falta la carpeta o la credencial de Google Drive.");
  return tokenDeServicio(cred.email, cred.pem);
}

export async function publicarEnDrive(env: Env, archivo: { bytes: Uint8Array; mime: string; nombre: string }): Promise<string | null> {
  if (!driveListo(env)) return null;
  const token = await tokenAcceso(env);
  const carpeta = env.GOOGLE_DRIVE_FOLDER_ID!.trim();
  const id = crypto.randomUUID();
  const boundary = `licencias_${id.replace(/-/g, "")}`;
  const meta = JSON.stringify({ name: archivo.nombre.replace(/\//g, "_"), parents: [carpeta] });
  const encoder = new TextEncoder();
  const preambulo = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${archivo.mime}\r\n\r\n`,
  );
  const cierre = encoder.encode(`\r\n--${boundary}--`);
  const cuerpo = new Uint8Array(preambulo.byteLength + archivo.bytes.byteLength + cierre.byteLength);
  cuerpo.set(preambulo, 0);
  cuerpo.set(archivo.bytes, preambulo.byteLength);
  cuerpo.set(cierre, preambulo.byteLength + archivo.bytes.byteLength);
  const respuesta = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
      body: cuerpo,
    },
  );
  if (!respuesta.ok) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "No se pudo guardar la fotografía en Google Drive.");
  const json = (await respuesta.json()) as { id?: string };
  if (!json.id) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google Drive no confirmó el archivo.");
  return json.id;
}

function credencialesDrive(env: Env): { email: string; pem: string; carpeta: string } | null {
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const pem = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  const carpeta = env.GOOGLE_DRIVE_FOLDER_ID?.trim();
  if (!email || !pem || !carpeta) return null;
  return { email, pem, carpeta };
}

export function backendFoto(env: Env): "drive" | "r2" {
  return env.PHOTO_BACKEND === "drive" ? "drive" : "r2";
}

export async function guardarFoto(
  env: Env,
  archivo: { bytes: Uint8Array; nombreOriginal: string },
  maxBytes: number,
): Promise<FotoGuardada> {
  if (archivo.bytes.byteLength === 0) {
    throw new ErrorApp(400, "FOTO_VACIA", "La fotografía llegó vacía.");
  }
  if (archivo.bytes.byteLength > maxBytes) {
    throw new ErrorApp(413, "FOTO_GRANDE", "La fotografía supera el tamaño máximo configurado.");
  }
  const mime = detectarImagen(archivo.bytes);
  if (!mime) {
    throw new ErrorApp(400, "FOTO_INVALIDA", "La fotografía debe ser JPEG, PNG o WebP.");
  }
  const nombre = nombreSeguro(archivo.nombreOriginal, mime);
  const id = crypto.randomUUID();

  if (backendFoto(env) === "drive") {
    const cred = credencialesDrive(env);
    if (!cred) {
      throw new ErrorApp(
        503,
        "DRIVE_SIN_CONFIGURAR",
        "Falta la cuenta de servicio o la carpeta de Google Drive. No se guardó la fotografía.",
      );
    }
    const token = await tokenDeServicio(cred.email, cred.pem);
    const boundary = `licencias_${id.replace(/-/g, "")}`;
    const meta = JSON.stringify({ name: `${id}-${nombre}`, parents: [cred.carpeta] });
    const encoder = new TextEncoder();
    const preambulo = encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`,
    );
    const cierre = encoder.encode(`\r\n--${boundary}--`);
    const cuerpo = new Uint8Array(preambulo.byteLength + archivo.bytes.byteLength + cierre.byteLength);
    cuerpo.set(preambulo, 0);
    cuerpo.set(archivo.bytes, preambulo.byteLength);
    cuerpo.set(cierre, preambulo.byteLength + archivo.bytes.byteLength);
    const respuesta = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true",
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": `multipart/related; boundary=${boundary}`,
        },
        body: cuerpo,
      },
    );
    if (!respuesta.ok) {
      throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "No se pudo guardar la fotografía en Google Drive.");
    }
    const json = (await respuesta.json()) as { id?: string };
    if (!json.id) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google Drive no confirmó el archivo.");
    return { backend: "drive", externalId: json.id, mime, nombre, bytes: archivo.bytes.byteLength };
  }

  await env.FOTOS.put(`fotos/${id}`, archivo.bytes, { httpMetadata: { contentType: mime } });
  return { backend: "r2", externalId: id, mime, nombre, bytes: archivo.bytes.byteLength };
}

export async function leerFoto(
  env: Env,
  backend: string,
  externalId: string,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  if (backend === "r2") {
    const objeto = await env.FOTOS.get(`fotos/${externalId}`);
    if (!objeto) return null;
    return { bytes: await objeto.arrayBuffer(), mime: objeto.httpMetadata?.contentType ?? "application/octet-stream" };
  }
  if (!driveListo(env)) return null;
  const token = await tokenAcceso(env);
  const respuesta = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(externalId)}?alt=media`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) return null;
  return { bytes: await respuesta.arrayBuffer(), mime: respuesta.headers.get("content-type") ?? "application/octet-stream" };
}

/** Arma el JWT de Drive. Sirve para probar la firma sin llamar a Google. */
export async function firmarJwtDrive(email: string, pem: string, ahora = Math.floor(Date.now() / 1000)): Promise<string> {
  const clave = await crypto.subtle.importKey(
    "pkcs8",
    pemAPkcs8(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const encabezado = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = b64url(
    JSON.stringify({
      iss: email,
      scope: "https://www.googleapis.com/auth/drive",
      aud: "https://oauth2.googleapis.com/token",
      iat: ahora,
      exp: ahora + 3600,
    }),
  );
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", clave, new TextEncoder().encode(`${encabezado}.${cuerpo}`));
  return `${encabezado}.${cuerpo}.${b64url(firma)}`;
}
