import { ErrorApp } from "../http/error";
import { enmascararRut, formatearRut } from "../domain/rut";
import { partesEnZona } from "../domain/tiempo";

/** Llegadas agrupadas por hora de Chile. */
export function porHoraLocal(marcas: string[]): { hora: string; n: number }[] {
  const mapa = new Map<string, number>();
  for (const marca of marcas) {
    const fecha = new Date(marca);
    if (Number.isNaN(fecha.getTime())) continue;
    const hora = `${partesEnZona(fecha, "America/Santiago").hora.slice(0, 2)}:00`;
    mapa.set(hora, (mapa.get(hora) ?? 0) + 1);
  }
  return [...mapa.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([hora, n]) => ({ hora, n }));
}

export const ESTADOS_MESON = ["EN_ESPERA", "EN_ATENCION", "ATENDIDO", "SE_RETIRO"] as const;
export type EstadoMeson = (typeof ESTADOS_MESON)[number];

export interface ServicioMeson {
  id: string;
  nombre: string;
  activo: number;
  orden: number;
}

export interface AtencionMeson {
  id: string;
  numero: number;
  rut: string;
  nombre: string;
  servicioId: string;
  servicio: string;
  observacion: string | null;
  estado: EstadoMeson;
  llegadaAt: string;
  atencionAt: string | null;
  terminoAt: string | null;
  registradoPor: string;
  atendidoPor: string | null;
}

/** Transiciones válidas. Deshacer vuelve a EN_ESPERA y limpia las marcas. */
const PASOS: Record<EstadoMeson, EstadoMeson[]> = {
  EN_ESPERA: ["EN_ATENCION", "ATENDIDO", "SE_RETIRO"],
  EN_ATENCION: ["ATENDIDO", "EN_ESPERA", "SE_RETIRO"],
  ATENDIDO: ["EN_ESPERA"],
  SE_RETIRO: ["EN_ESPERA"],
};

export function esEstadoMeson(valor: string): valor is EstadoMeson {
  return (ESTADOS_MESON as readonly string[]).includes(valor);
}

export function transicionValida(desde: EstadoMeson, hacia: EstadoMeson): boolean {
  return PASOS[desde].includes(hacia);
}

export function idServicio(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40) || "SERVICIO";
}

export async function listarServicios(db: D1Database, todos: boolean): Promise<ServicioMeson[]> {
  const filas = await db.prepare(
    `SELECT id, nombre, activo, orden FROM servicios_meson ${todos ? "" : "WHERE activo = 1"} ORDER BY activo DESC, orden, nombre`,
  ).all<ServicioMeson>();
  return filas.results;
}

export async function crearServicio(db: D1Database, nombre: string): Promise<ServicioMeson> {
  let id = idServicio(nombre);
  const existe = await db.prepare("SELECT id FROM servicios_meson WHERE id = ? OR lower(nombre) = lower(?)").bind(id, nombre).first<{ id: string }>();
  if (existe?.id === id) id = `${id.slice(0, 32)}_${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const duplicado = await db.prepare("SELECT 1 AS n FROM servicios_meson WHERE lower(nombre) = lower(?)").bind(nombre).first();
  if (duplicado) throw new ErrorApp(409, "DUPLICADO", "Ya existe un servicio con ese nombre.");
  const orden = await db.prepare("SELECT COALESCE(MAX(orden), 0) + 1 AS n FROM servicios_meson").first<{ n: number }>();
  await db.prepare("INSERT INTO servicios_meson (id, nombre, activo, orden, creado_at) VALUES (?, ?, 1, ?, ?)")
    .bind(id, nombre, orden?.n ?? 1, new Date().toISOString()).run();
  return { id, nombre, activo: 1, orden: orden?.n ?? 1 };
}

export async function editarServicio(db: D1Database, id: string, cambios: { nombre?: string; activo?: boolean; orden?: number }): Promise<ServicioMeson> {
  const antes = await db.prepare("SELECT id, nombre, activo, orden FROM servicios_meson WHERE id = ?").bind(id).first<ServicioMeson>();
  if (!antes) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe ese servicio.");
  const nombre = cambios.nombre ?? antes.nombre;
  if (cambios.nombre) {
    const otro = await db.prepare("SELECT 1 AS n FROM servicios_meson WHERE lower(nombre) = lower(?) AND id <> ?").bind(nombre, id).first();
    if (otro) throw new ErrorApp(409, "DUPLICADO", "Ya existe un servicio con ese nombre.");
  }
  const activo = cambios.activo === undefined ? antes.activo : cambios.activo ? 1 : 0;
  const orden = cambios.orden === undefined ? antes.orden : Math.max(0, Math.min(999, Math.round(cambios.orden)));
  await db.prepare("UPDATE servicios_meson SET nombre = ?, activo = ?, orden = ? WHERE id = ?").bind(nombre, activo, orden, id).run();
  return { id, nombre, activo, orden };
}

/** Nombre conocido de un RUT, desde las personas con cita o desde visitas anteriores al mesón. */
export async function buscarPersona(db: D1Database, rut: string, hoy: string) {
  const [ciudadano, visita, visitas, citaHoy] = await Promise.all([
    db.prepare("SELECT id, nombres, apellidos FROM ciudadanos WHERE rut = ?").bind(rut).first<{ id: string; nombres: string; apellidos: string }>(),
    db.prepare("SELECT nombre FROM atenciones_meson WHERE rut = ? ORDER BY llegada_at DESC LIMIT 1").bind(rut).first<{ nombre: string }>(),
    db.prepare("SELECT COUNT(*) AS n, MAX(fecha) AS ultima FROM atenciones_meson WHERE rut = ?").bind(rut).first<{ n: number; ultima: string | null }>(),
    db.prepare(
      `SELECT c.id, c.hora, c.estado, t.nombre AS tramite FROM citas c
       JOIN ciudadanos ci ON ci.id = c.ciudadano_id JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
       WHERE ci.rut = ? AND c.fecha = ? AND c.estado NOT IN ('CANCELADA','ANULADA') ORDER BY c.hora LIMIT 1`,
    ).bind(rut, hoy).first<{ id: string; hora: string; estado: string; tramite: string }>(),
  ]);
  const nombre = ciudadano ? `${ciudadano.nombres} ${ciudadano.apellidos}` : visita?.nombre ?? null;
  return {
    rut: formatearRut(rut),
    nombre,
    conocido: Boolean(nombre),
    visitas: Number(visitas?.n ?? 0),
    ultimaVisita: visitas?.ultima ?? null,
    citaHoy: citaHoy ?? null,
  };
}

export async function registrarAtencion(
  db: D1Database,
  input: { rut: string; nombre: string; servicioId: string; observacion: string | null; usuarioId: string; fecha: string; ahora: Date },
): Promise<AtencionMeson> {
  const servicio = await db.prepare("SELECT id, nombre, activo FROM servicios_meson WHERE id = ?").bind(input.servicioId).first<ServicioMeson>();
  if (!servicio || servicio.activo !== 1) throw new ErrorApp(404, "NO_ENCONTRADO", "Ese servicio no está disponible.");
  const enCurso = await db.prepare(
    "SELECT numero FROM atenciones_meson WHERE fecha = ? AND rut = ? AND servicio_id = ? AND estado IN ('EN_ESPERA','EN_ATENCION')",
  ).bind(input.fecha, input.rut, servicio.id).first<{ numero: number }>();
  if (enCurso) throw new ErrorApp(409, "EN_ESPERA", `Esta persona ya está en espera con el número ${numeroTexto(enCurso.numero)}.`);
  const ciudadano = await db.prepare("SELECT id FROM ciudadanos WHERE rut = ?").bind(input.rut).first<{ id: string }>();
  const id = crypto.randomUUID();
  const marca = input.ahora.toISOString();
  // El número del día se calcula en la misma sentencia para que dos mesones no repitan número.
  for (let intento = 0; intento < 3; intento += 1) {
    try {
      await db.prepare(
        `INSERT INTO atenciones_meson (id, fecha, numero, ciudadano_id, rut, nombre, servicio_id, observacion, estado, llegada_at, registrado_por, actualizado_at)
         SELECT ?, ?, COALESCE(MAX(numero), 0) + 1, ?, ?, ?, ?, ?, 'EN_ESPERA', ?, ?, ? FROM atenciones_meson WHERE fecha = ?`,
      ).bind(id, input.fecha, ciudadano?.id ?? null, input.rut, input.nombre, servicio.id, input.observacion, marca, input.usuarioId, marca, input.fecha).run();
      break;
    } catch (error) {
      if (intento === 2 || !(error instanceof Error) || !error.message.includes("UNIQUE")) throw error;
    }
  }
  const fila = await atencionPorId(db, id);
  if (!fila) throw new ErrorApp(500, "ERROR_INTERNO", "No se pudo registrar la atención.");
  return fila;
}

export function numeroTexto(numero: number): string {
  return `S-${String(numero).padStart(3, "0")}`;
}

const SELECT_ATENCION = `
  SELECT a.id, a.numero, a.rut, a.nombre, a.servicio_id AS servicioId, COALESCE(s.nombre, a.servicio_id) AS servicio,
         a.observacion, a.estado, a.llegada_at AS llegadaAt, a.atencion_at AS atencionAt, a.termino_at AS terminoAt,
         a.fecha, COALESCE(r.nombre, 'Sin registro') AS registradoPor, at.nombre AS atendidoPor
  FROM atenciones_meson a
  LEFT JOIN servicios_meson s ON s.id = a.servicio_id
  LEFT JOIN usuarios r ON r.id = a.registrado_por
  LEFT JOIN usuarios at ON at.id = a.atendido_por`;

export async function atencionPorId(db: D1Database, id: string): Promise<(AtencionMeson & { fecha: string }) | null> {
  return db.prepare(`${SELECT_ATENCION} WHERE a.id = ?`).bind(id).first<AtencionMeson & { fecha: string }>();
}

export async function cambiarEstadoAtencion(
  db: D1Database,
  input: { id: string; estado: EstadoMeson; usuarioId: string; esAdmin: boolean; hoy: string; ahora: Date; minutosDeshacer: number },
) {
  const actual = await atencionPorId(db, input.id);
  if (!actual) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe esa atención.");
  if (!input.esAdmin && actual.fecha !== input.hoy) throw new ErrorApp(403, "SIN_PERMISO", "Recepción solo cambia las atenciones de hoy.");
  if (!transicionValida(actual.estado, input.estado)) throw new ErrorApp(409, "ESTADO_INVALIDO", "Ese cambio de estado no corresponde.");
  if (input.estado === "EN_ESPERA" && (actual.estado === "ATENDIDO" || actual.estado === "SE_RETIRO") && !input.esAdmin) {
    const limite = new Date(actual.terminoAt ?? actual.llegadaAt).getTime() + input.minutosDeshacer * 60_000;
    if (input.ahora.getTime() > limite) throw new ErrorApp(403, "FUERA_DE_PLAZO", `Pasaron los ${input.minutosDeshacer} minutos. Solo administración puede corregirla.`);
  }
  const marca = input.ahora.toISOString();
  let sql = "";
  const params: unknown[] = [];
  if (input.estado === "EN_ATENCION") {
    sql = "UPDATE atenciones_meson SET estado = 'EN_ATENCION', atencion_at = ?, atendido_por = ?, actualizado_por = ?, actualizado_at = ? WHERE id = ? AND estado = ?";
    params.push(marca, input.usuarioId, input.usuarioId, marca, input.id, actual.estado);
  } else if (input.estado === "ATENDIDO") {
    sql = "UPDATE atenciones_meson SET estado = 'ATENDIDO', atencion_at = COALESCE(atencion_at, ?), atendido_por = COALESCE(atendido_por, ?), termino_at = ?, actualizado_por = ?, actualizado_at = ? WHERE id = ? AND estado = ?";
    params.push(marca, input.usuarioId, marca, input.usuarioId, marca, input.id, actual.estado);
  } else if (input.estado === "SE_RETIRO") {
    sql = "UPDATE atenciones_meson SET estado = 'SE_RETIRO', termino_at = ?, actualizado_por = ?, actualizado_at = ? WHERE id = ? AND estado = ?";
    params.push(marca, input.usuarioId, marca, input.id, actual.estado);
  } else {
    sql = "UPDATE atenciones_meson SET estado = 'EN_ESPERA', atencion_at = NULL, atendido_por = NULL, termino_at = NULL, actualizado_por = ?, actualizado_at = ? WHERE id = ? AND estado = ?";
    params.push(input.usuarioId, marca, input.id, actual.estado);
  }
  const resultado = await db.prepare(sql).bind(...params).run();
  if ((resultado.meta?.changes ?? 0) === 0) throw new ErrorApp(409, "CAMBIO_CONCURRENTE", "Otra persona cambió esta atención. Se actualizó la lista.");
  return { antes: actual.estado, despues: input.estado, fila: await atencionPorId(db, input.id) };
}

export interface ResumenMeson {
  total: number;
  enEspera: number;
  enAtencion: number;
  atendidos: number;
  seRetiraron: number;
  esperaMin: number | null;
  esperaMaxMin: number | null;
  porServicio: { servicio: string; n: number }[];
  porHora: { hora: string; n: number }[];
  porUsuario: { nombre: string; registradas: number; atendidas: number }[];
}

export async function resumenMeson(db: D1Database, desde: string, hasta: string): Promise<ResumenMeson> {
  const [conteo, servicios, horas, usuarios] = await Promise.all([
    db.prepare(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN estado = 'EN_ESPERA' THEN 1 ELSE 0 END) AS enEspera,
              SUM(CASE WHEN estado = 'EN_ATENCION' THEN 1 ELSE 0 END) AS enAtencion,
              SUM(CASE WHEN estado = 'ATENDIDO' THEN 1 ELSE 0 END) AS atendidos,
              SUM(CASE WHEN estado = 'SE_RETIRO' THEN 1 ELSE 0 END) AS seRetiraron,
              AVG(CASE WHEN atencion_at IS NOT NULL THEN (julianday(atencion_at) - julianday(llegada_at)) * 1440 END) AS espera,
              MAX(CASE WHEN atencion_at IS NOT NULL THEN (julianday(atencion_at) - julianday(llegada_at)) * 1440 END) AS esperaMax
       FROM atenciones_meson WHERE fecha >= ? AND fecha <= ?`,
    ).bind(desde, hasta).first<Record<string, number | null>>(),
    db.prepare(
      `SELECT COALESCE(s.nombre, a.servicio_id) AS servicio, COUNT(*) AS n FROM atenciones_meson a
       LEFT JOIN servicios_meson s ON s.id = a.servicio_id WHERE a.fecha >= ? AND a.fecha <= ?
       GROUP BY a.servicio_id ORDER BY n DESC`,
    ).bind(desde, hasta).all<{ servicio: string; n: number }>(),
    db.prepare(
      "SELECT llegada_at AS at FROM atenciones_meson WHERE fecha >= ? AND fecha <= ? LIMIT 5000",
    ).bind(desde, hasta).all<{ at: string }>(),
    db.prepare(
      `SELECT u.nombre AS nombre,
              SUM(CASE WHEN a.registrado_por = u.id THEN 1 ELSE 0 END) AS registradas,
              SUM(CASE WHEN a.atendido_por = u.id AND a.estado = 'ATENDIDO' THEN 1 ELSE 0 END) AS atendidas
       FROM usuarios u JOIN atenciones_meson a ON a.registrado_por = u.id OR a.atendido_por = u.id
       WHERE a.fecha >= ? AND a.fecha <= ? GROUP BY u.id ORDER BY registradas DESC LIMIT 8`,
    ).bind(desde, hasta).all<{ nombre: string; registradas: number; atendidas: number }>(),
  ]);
  const redondo = (valor: number | null | undefined) => (valor === null || valor === undefined || Number.isNaN(Number(valor)) ? null : Math.round(Number(valor)));
  return {
    total: Number(conteo?.total ?? 0),
    enEspera: Number(conteo?.enEspera ?? 0),
    enAtencion: Number(conteo?.enAtencion ?? 0),
    atendidos: Number(conteo?.atendidos ?? 0),
    seRetiraron: Number(conteo?.seRetiraron ?? 0),
    esperaMin: redondo(conteo?.espera),
    esperaMaxMin: redondo(conteo?.esperaMax),
    porServicio: servicios.results.map((f) => ({ servicio: f.servicio, n: Number(f.n) })),
    porHora: porHoraLocal(horas.results.map((f) => f.at)),
    porUsuario: usuarios.results.map((f) => ({ nombre: f.nombre, registradas: Number(f.registradas), atendidas: Number(f.atendidas) })),
  };
}

export async function listarDia(db: D1Database, fecha: string, q: string, rut: string | null) {
  const filas = await db.prepare(
    `${SELECT_ATENCION} WHERE a.fecha = ?
       AND (? = '' OR a.rut = ? OR a.nombre LIKE ? ESCAPE '\\' OR ('S-' || substr('000' || a.numero, -3)) = upper(?))
     ORDER BY a.numero`,
  ).bind(fecha, q, rut ?? "", `%${q.replace(/[\\%_]/g, (s) => `\\${s}`)}%`, q).all<AtencionMeson>();
  return filas.results.map((fila) => ({ ...fila, rut: enmascararRut(fila.rut), numeroTexto: numeroTexto(fila.numero) }));
}

/**
 * Al cerrar la jornada, quien sigue en espera se da por retirado y quien estaba en atención queda atendido.
 * incluirHoy es true en el cierre manual; el cron solo cierra días anteriores.
 */
export async function cerrarMesonPendiente(db: D1Database, hoy: string, incluirHoy: boolean, ahora: Date, usuarioId: string | null): Promise<number> {
  const marca = ahora.toISOString();
  const resultado = await db.prepare(
    `UPDATE atenciones_meson
     SET estado = CASE WHEN estado = 'EN_ATENCION' THEN 'ATENDIDO' ELSE 'SE_RETIRO' END,
         termino_at = COALESCE(termino_at, ?), actualizado_por = COALESCE(?, actualizado_por), actualizado_at = ?
     WHERE estado IN ('EN_ESPERA', 'EN_ATENCION') AND ${incluirHoy ? "fecha <= ?" : "fecha < ?"}`,
  ).bind(marca, usuarioId, marca, hoy).run();
  return resultado.meta?.changes ?? 0;
}
