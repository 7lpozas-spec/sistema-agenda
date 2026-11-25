import { env, exports } from "cloudflare:workers";
import type { Rol } from "../src/domain/catalogo";
import { hashContrasena } from "../src/security/claves";

export const CLAVE = "Clave-Prueba-2026";
const ORIGEN = "https://licencias.test";

export async function crearCuenta(rol: Rol, email?: string): Promise<{ id: string; email: string }> {
  const id = crypto.randomUUID();
  const correo = (email ?? `${rol}-${id.slice(0, 8)}@test.local`).toLowerCase();
  const ahora = new Date().toISOString();
  const hash = await hashContrasena(CLAVE, 1000);
  await env.DB.prepare(
    `INSERT INTO usuarios (id, email, nombre, rol, password_hash, puede_ver_otra_agenda, puede_usar_sobrecupo, puede_capturar_fotos, creado_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, 1, ?)`,
  )
    .bind(id, correo, `Cuenta ${rol}`, rol, hash, ahora)
    .run();
  return { id, email: correo };
}

export interface SesionPrueba {
  cookie: string;
  csrf: string;
  email: string;
}

export async function entrar(rol: Rol): Promise<SesionPrueba> {
  const cuenta = await crearCuenta(rol);
  const respuesta = await llamar("/auth/login", {
    method: "POST",
    body: { email: cuenta.email, contrasena: CLAVE },
  });
  if (respuesta.status !== 200) {
    throw new Error(`No se pudo entrar: ${respuesta.status} ${JSON.stringify(respuesta.json)}`);
  }
  const cookies = leerCookies(respuesta.headers);
  const sesion = cookies.lic_sesion;
  const csrf = cookies.lic_csrf;
  if (!sesion || !csrf) throw new Error(`Faltan cookies: ${JSON.stringify(cookies)}`);
  return { cookie: `lic_sesion=${sesion}; lic_csrf=${csrf}`, csrf, email: cuenta.email };
}

export async function llamar(
  ruta: string,
  opciones: { method?: string; body?: unknown; sesion?: SesionPrueba; form?: FormData; cuerpoTexto?: string } = {},
): Promise<{ status: number; json: unknown; headers: Headers; binario: ArrayBuffer }> {
  const headers = new Headers({ origin: ORIGEN });
  if (opciones.sesion) {
    headers.set("cookie", opciones.sesion.cookie);
    if ((opciones.method ?? "GET") !== "GET") headers.set("x-csrf-token", opciones.sesion.csrf);
  }
  let body: BodyInit | undefined;
  if (opciones.form) body = opciones.form;
  else if (opciones.cuerpoTexto !== undefined) {
    headers.set("content-type", "text/csv; charset=utf-8");
    body = opciones.cuerpoTexto;
  } else if (opciones.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opciones.body);
  }
  const respuesta = await exports.default.fetch(`${ORIGEN}/api${ruta}`, {
    method: opciones.method ?? "GET",
    headers,
    body,
  });
  const tipo = respuesta.headers.get("content-type") ?? "";
  const binario = await respuesta.arrayBuffer();
  if (!tipo.includes("json")) {
    return { status: respuesta.status, json: null, headers: respuesta.headers, binario };
  }
  const texto = new TextDecoder().decode(binario);
  return { status: respuesta.status, json: texto ? JSON.parse(texto) : null, headers: respuesta.headers, binario };
}

function leerCookies(headers: Headers): Record<string, string> {
  const lista = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [];
  const salida: Record<string, string> = {};
  for (const linea of lista) {
    const par = linea.split(";")[0] ?? "";
    const indice = par.indexOf("=");
    if (indice > 0) salida[par.slice(0, indice)] = par.slice(indice + 1);
  }
  return salida;
}

export async function insertarCupo(input: {
  agenda?: "general" | "primera_vez";
  fecha: string;
  horaInicio?: string;
  horaFin?: string;
  capacidad?: number;
  estado?: "abierto" | "bloqueado";
}): Promise<string> {
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO cupos (id, agenda_id, fecha, hora_inicio, hora_fin, capacidad, reservados, estado, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  )
    .bind(
      id,
      input.agenda ?? "general",
      input.fecha,
      input.horaInicio ?? "10:00",
      input.horaFin ?? "10:15",
      input.capacidad ?? 1,
      input.estado ?? "abierto",
      new Date().toISOString(),
    )
    .run();
  return id;
}

export function persona(rut: string, nacimiento = "1990-05-05") {
  return {
    rut,
    nombres: "Persona",
    apellidoPaterno: "Ficticia",
    apellidoMaterno: "Ejemplo",
    fechaNacimiento: nacimiento,
    email: "persona.ficticia@ejemplo.test",
    telefono: "+56911111111",
    domicilio: "Pasaje Los Ejemplos 50",
  };
}
