export class ErrorApi extends Error {
  constructor(
    readonly codigo: string,
    mensaje: string,
  ) {
    super(mensaje);
  }
}

function csrf(): string {
  const par = document.cookie
    .split("; ")
    .find((item) => item.startsWith("lic_csrf="));
  return par ? decodeURIComponent(par.slice("lic_csrf=".length)) : "";
}

export async function api<T>(
  ruta: string,
  opciones: {
    method?: string;
    body?: unknown;
    form?: FormData;
    texto?: string;
    idempotencyKey?: string;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const method = opciones.method ?? "GET";
  const headers = new Headers();
  if (method !== "GET" && method !== "HEAD")
    headers.set("x-csrf-token", csrf());
  if (opciones.idempotencyKey)
    headers.set("idempotency-key", opciones.idempotencyKey);
  let body: BodyInit | undefined;
  if (opciones.form) body = opciones.form;
  else if (opciones.texto !== undefined) {
    headers.set("content-type", "text/csv; charset=utf-8");
    body = opciones.texto;
  } else if (opciones.body !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opciones.body);
  }
  const respuesta = await fetch(ruta, {
    method,
    headers,
    body,
    credentials: "same-origin",
    signal: opciones.signal,
  });
  const tipo = respuesta.headers.get("content-type") ?? "";
  const datos = tipo.includes("json") ? await respuesta.json() : null;
  if (!respuesta.ok) {
    const codigo = datos?.codigo ?? datos?.error?.codigo ?? "ERROR";
    const mensaje =
      datos?.mensaje ??
      datos?.error?.mensaje ??
      "No se pudo completar la operación.";
    throw new ErrorApi(codigo, mensaje);
  }
  return datos as T;
}

export function fechaHoy(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function fechaHumana(iso: string): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const texto = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(anio, mes - 1, dia)));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export function formatearRut(rut: string): string {
  const [cuerpo, dv] = rut.split("-");
  return `${cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${dv}`;
}
