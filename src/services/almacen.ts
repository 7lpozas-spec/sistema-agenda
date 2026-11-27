import { ErrorApp } from "../http/error";

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

/**
 * Google Drive es el destino principal de las fotos.
 * Con Gmail personal sirve OAuth con refresh token (GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET,
 * GOOGLE_OAUTH_REFRESH_TOKEN). La carpeta raíz es GOOGLE_DRIVE_FOLDER_ID o, si falta, una carpeta
 * "Licencias Recoleta" que la app crea en Mi unidad. Una cuenta de servicio solo sirve con una unidad
 * compartida de Workspace: no tiene cuota propia en Mi unidad.
 */
export function driveListo(env: Env): boolean {
  if (env.GOOGLE_OAUTH_CLIENT_ID?.trim() && env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() && env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim()) return true;
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim() && env.GOOGLE_DRIVE_FOLDER_ID?.trim());
}

async function tokenAcceso(env: Env): Promise<string> {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const secret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refresh = env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();
  if (clientId && secret && refresh) return tokenDeUsuario(clientId, secret, refresh);
  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const pem = env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.trim();
  if (!email || !pem) throw new ErrorApp(503, "DRIVE_SIN_CONFIGURAR", "Google Drive no está configurado.");
  return tokenDeServicio(email, pem);
}

const API = "https://www.googleapis.com/drive/v3/files";
const CARPETA = "application/vnd.google-apps.folder";
const carpetas = new Map<string, string>();

function comillas(texto: string): string {
  return texto.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Busca o crea una carpeta. Se recuerda en memoria para no repetir llamadas. */
async function carpeta(token: string, nombre: string, padre: string | null): Promise<string> {
  const clave = `${padre ?? "root"}/${nombre}`;
  const conocida = carpetas.get(clave);
  if (conocida) return conocida;
  const q = `name = '${comillas(nombre)}' and mimeType = '${CARPETA}' and trashed = false and '${padre ?? "root"}' in parents`;
  const busqueda = await fetch(`${API}?${new URLSearchParams({ q, fields: "files(id)", pageSize: "1", supportsAllDrives: "true", includeItemsFromAllDrives: "true" })}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!busqueda.ok) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google Drive no respondió.");
  const encontrada = ((await busqueda.json()) as { files?: { id: string }[] }).files?.[0]?.id;
  if (encontrada) {
    carpetas.set(clave, encontrada);
    return encontrada;
  }
  const creada = await fetch(`${API}?supportsAllDrives=true&fields=id`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ name: nombre, mimeType: CARPETA, ...(padre ? { parents: [padre] } : {}) }),
  });
  if (!creada.ok) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "No se pudo crear la carpeta en Google Drive.");
  const id = ((await creada.json()) as { id?: string }).id;
  if (!id) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google Drive no confirmó la carpeta.");
  carpetas.set(clave, id);
  return id;
}

/** Sube un archivo a raíz/ruta[0]/ruta[1]/… y devuelve su id en Drive. */
export async function subirADrive(env: Env, archivo: { bytes: Uint8Array; mime: string; nombre: string; ruta: string[] }): Promise<string> {
  const token = await tokenAcceso(env);
  let padre = env.GOOGLE_DRIVE_FOLDER_ID?.trim() || await carpeta(token, "Licencias Recoleta", null);
  for (const parte of archivo.ruta) padre = await carpeta(token, parte.replace(/[\\/]/g, "-"), padre);
  const boundary = `licencias_${crypto.randomUUID().replace(/-/g, "")}`;
  const meta = JSON.stringify({ name: archivo.nombre.replace(/\//g, "_"), parents: [padre] });
  const encoder = new TextEncoder();
  const preambulo = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${archivo.mime}\r\n\r\n`,
  );
  const cierre = encoder.encode(`\r\n--${boundary}--`);
  const cuerpo = new Uint8Array(preambulo.byteLength + archivo.bytes.byteLength + cierre.byteLength);
  cuerpo.set(preambulo, 0);
  cuerpo.set(archivo.bytes, preambulo.byteLength);
  cuerpo.set(cierre, preambulo.byteLength + archivo.bytes.byteLength);
  const respuesta = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": `multipart/related; boundary=${boundary}` },
    body: cuerpo,
  });
  if (!respuesta.ok) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "No se pudo guardar la fotografía en Google Drive.");
  const json = (await respuesta.json()) as { id?: string };
  if (!json.id) throw new ErrorApp(502, "DRIVE_NO_DISPONIBLE", "Google Drive no confirmó el archivo.");
  return json.id;
}

export async function leerDeDrive(env: Env, id: string): Promise<ArrayBuffer | null> {
  if (!driveListo(env)) return null;
  const token = await tokenAcceso(env);
  const respuesta = await fetch(`${API}/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`, { headers: { authorization: `Bearer ${token}` } });
  if (!respuesta.ok) return null;
  return respuesta.arrayBuffer();
}

/** Arma el JWT de la cuenta de servicio. Sirve para probar la firma sin llamar a Google. */
export async function firmarJwtDrive(email: string, pem: string, ahora = Math.floor(Date.now() / 1000)): Promise<string> {
  const clave = await crypto.subtle.importKey("pkcs8", pemAPkcs8(pem), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const encabezado = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const cuerpo = b64url(JSON.stringify({ iss: email, scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 }));
  const firma = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", clave, new TextEncoder().encode(`${encabezado}.${cuerpo}`));
  return `${encabezado}.${cuerpo}.${b64url(firma)}`;
}
