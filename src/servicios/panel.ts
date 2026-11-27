import { cantidadDocumentosRequeridos, type AgendaId, type Rol } from "../domain/catalogo";
import { agendasDeCitas, puedeCrearCita, puedeExportar, puedeVerCupos, vistaDe } from "../domain/permisos";
import { sumarDias } from "../domain/tiempo";
import { cuposDesdeAhora, diasLaborables, feriadosDelMes, libresPorDia } from "./disponibilidad";
import { armarEstadisticas, type Estadisticas } from "./estadisticas";

export interface FilaActividad {
  nombre: string;
  rol: string;
  agenda: string;
  creadas: number;
  reagendadas: number;
  canceladas: number;
  asistencias: number;
  anterior: { creadas: number; reagendadas: number; canceladas: number; asistencias: number };
}

export interface Panel {
  vista: ReturnType<typeof vistaDe>;
  agendas: AgendaId[];
  puedeAgendar: boolean;
  exportar: boolean;
  hoy: {
    fecha: string;
    citados: number;
    llegaron: number;
    faltan: number;
    inasistencias: number;
    aTiempo: number;
    atrasados: number;
    proxima: { id: string; hora: string; nombre: string; tramite: string; docsCargados: number; docsRequeridos: number } | null;
    docsPendientes: number;
    citas: CitaDia[];
  };
  periodo: {
    citados: number;
    llegaron: number;
    aTiempo: number;
    atrasados: number;
    inasistencias: number;
    esperaMin: number | null;
    anterior: { citados: number; llegaron: number; aTiempo: number; atrasados: number; inasistencias: number };
  };
  flujo: { hora: string; citados: number; llegaron: number }[];
  proximosDias: { fecha: string; citados: number }[];
  huecos: { agenda: string; proxima: { fecha: string; hora: string; libres: number } | null; siguientes: { fecha: string; hora: string; libres: number }[] }[];
  kpis: Estadisticas["kpis"] | null;
  kpisPorAgenda: { agenda: string; total: number; asistieron: number; noAsistieron: number; atrasados: number }[];
  mes: { mes: string; dias: Awaited<ReturnType<typeof libresPorDia>>; feriados: string[]; laborables: number[] };
  actividad: { filas: FilaActividad[]; recientes: Reciente[] };
  relevantes: {
    inasistencias: { nombre: string; n: number }[];
    repetidas: { nombre: string; n: number }[];
    tramites: { nombre: string; citas: number }[];
    ocupacion: { hora: string; citas: number }[];
  };
}

interface CitaDia {
  id: string;
  hora: string;
  nombre: string;
  rut: string;
  estado: string;
  tramite: string;
  agenda: string;
  docsCargados: number;
  docsRequeridos: number;
}

interface Reciente {
  at: string;
  quien: string;
  accion: string;
  persona: string;
  agenda: string;
  fecha: string;
  hora: string;
}

function marcas(agendas: string[]): string {
  return agendas.map(() => "?").join(",");
}

function num(valor: unknown): number {
  return Number(valor ?? 0);
}

async function conteoEstado(db: D1Database, desde: string, hasta: string, agendas: AgendaId[]) {
  const fila = await db.prepare(
    `SELECT
       SUM(CASE WHEN estado NOT IN ('CANCELADA','ANULADA') THEN 1 ELSE 0 END) AS citados,
       SUM(CASE WHEN estado IN ('ASISTIO','ATRASADO') THEN 1 ELSE 0 END) AS llegaron,
       SUM(CASE WHEN estado = 'ASISTIO' THEN 1 ELSE 0 END) AS aTiempo,
       SUM(CASE WHEN estado = 'ATRASADO' THEN 1 ELSE 0 END) AS atrasados,
       SUM(CASE WHEN estado = 'NO_ASISTIO' THEN 1 ELSE 0 END) AS inasistencias
     FROM citas WHERE fecha >= ? AND fecha <= ? AND agenda_id IN (${marcas(agendas)})`,
  ).bind(desde, hasta, ...agendas).first<{ citados: number; llegaron: number; aTiempo: number; atrasados: number; inasistencias: number }>();
  return {
    citados: num(fila?.citados),
    llegaron: num(fila?.llegaron),
    aTiempo: num(fila?.aTiempo),
    atrasados: num(fila?.atrasados),
    inasistencias: num(fila?.inasistencias),
  };
}

async function actividadDe(db: D1Database, desde: string, hasta: string, anteriorDesde: string, anteriorHasta: string, agendas: AgendaId[]): Promise<FilaActividad[]> {
  const claves = marcas(agendas);
  const [creadas, reagendadas, canceladas, asistencias, creadasAntes, reagendadasAntes, canceladasAntes, asistenciasAntes] = await Promise.all([
    db.prepare(
      `SELECT COALESCE(u.nombre, 'Sin registro') AS nombre, COALESCE(u.rol, '') AS rol, c.agenda_id AS agenda, COUNT(*) AS n
       FROM citas c LEFT JOIN usuarios u ON u.id = c.creado_por
       WHERE c.fecha >= ? AND c.fecha <= ? AND c.agenda_id IN (${claves})
       GROUP BY u.nombre, u.rol, c.agenda_id`,
    ).bind(desde, hasta, ...agendas).all<{ nombre: string; rol: string; agenda: string; n: number }>(),
    db.prepare(
      `SELECT COALESCE(u.nombre, 'Sin registro') AS nombre, COALESCE(u.rol, '') AS rol, c.agenda_id AS agenda, COUNT(*) AS n
       FROM cita_historial h JOIN citas c ON c.id = h.cita_id LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.evento = 'REAGENDADA' AND substr(h.at, 1, 10) >= ? AND substr(h.at, 1, 10) <= ? AND c.agenda_id IN (${claves})
       GROUP BY u.nombre, u.rol, c.agenda_id`,
    ).bind(desde, hasta, ...agendas).all<{ nombre: string; rol: string; agenda: string; n: number }>(),
    db.prepare(
      `SELECT COALESCE(u.nombre, 'Sin registro') AS nombre, COALESCE(u.rol, '') AS rol, c.agenda_id AS agenda, COUNT(*) AS n
       FROM citas c LEFT JOIN usuarios u ON u.id = COALESCE(c.actualizado_por, c.creado_por)
       WHERE c.estado = 'CANCELADA' AND c.fecha >= ? AND c.fecha <= ? AND c.agenda_id IN (${claves})
       GROUP BY u.nombre, u.rol, c.agenda_id`,
    ).bind(desde, hasta, ...agendas).all<{ nombre: string; rol: string; agenda: string; n: number }>(),
    db.prepare(
      `SELECT COALESCE(u.nombre, 'Sin registro') AS nombre, COALESCE(u.rol, '') AS rol, c.agenda_id AS agenda, COUNT(*) AS n
       FROM citas c LEFT JOIN usuarios u ON u.id = COALESCE(c.asistencia_marcada_por, c.creado_por)
       WHERE c.estado IN ('ASISTIO','ATRASADO','NO_ASISTIO') AND c.fecha >= ? AND c.fecha <= ? AND c.agenda_id IN (${claves})
       GROUP BY u.nombre, u.rol, c.agenda_id`,
    ).bind(desde, hasta, ...agendas).all<{ nombre: string; rol: string; agenda: string; n: number }>(),
    db.prepare(
      `SELECT COALESCE(u.nombre, 'Sin registro') AS nombre, c.agenda_id AS agenda, COUNT(*) AS n
       FROM citas c LEFT JOIN usuarios u ON u.id = c.creado_por
       WHERE c.fecha >= ? AND c.fecha <= ? AND c.agenda_id IN (${claves}) GROUP BY u.nombre, c.agenda_id`,
    ).bind(anteriorDesde, anteriorHasta, ...agendas).all<{ nombre: string; agenda: string; n: number }>(),
    db.prepare(
      `SELECT COALESCE(u.nombre, 'Sin registro') AS nombre, c.agenda_id AS agenda, COUNT(*) AS n
       FROM cita_historial h JOIN citas c ON c.id = h.cita_id LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.evento = 'REAGENDADA' AND substr(h.at, 1, 10) >= ? AND substr(h.at, 1, 10) <= ? AND c.agenda_id IN (${claves})
       GROUP BY u.nombre, c.agenda_id`,
    ).bind(anteriorDesde, anteriorHasta, ...agendas).all<{ nombre: string; agenda: string; n: number }>(),
    db.prepare(
      `SELECT COALESCE(u.nombre, 'Sin registro') AS nombre, c.agenda_id AS agenda, COUNT(*) AS n
       FROM citas c LEFT JOIN usuarios u ON u.id = COALESCE(c.actualizado_por, c.creado_por)
       WHERE c.estado = 'CANCELADA' AND c.fecha >= ? AND c.fecha <= ? AND c.agenda_id IN (${claves}) GROUP BY u.nombre, c.agenda_id`,
    ).bind(anteriorDesde, anteriorHasta, ...agendas).all<{ nombre: string; agenda: string; n: number }>(),
    db.prepare(
      `SELECT COALESCE(u.nombre, 'Sin registro') AS nombre, c.agenda_id AS agenda, COUNT(*) AS n
       FROM citas c LEFT JOIN usuarios u ON u.id = COALESCE(c.asistencia_marcada_por, c.creado_por)
       WHERE c.estado IN ('ASISTIO','ATRASADO','NO_ASISTIO') AND c.fecha >= ? AND c.fecha <= ? AND c.agenda_id IN (${claves})
       GROUP BY u.nombre, c.agenda_id`,
    ).bind(anteriorDesde, anteriorHasta, ...agendas).all<{ nombre: string; agenda: string; n: number }>(),
  ]);
  const mapa = new Map<string, FilaActividad>();
  const asegurar = (nombre: string, rol: string, agenda: string) => {
    const clave = `${nombre}|${agenda}`;
    const previa = mapa.get(clave);
    if (previa) return previa;
    const fila: FilaActividad = {
      nombre, rol, agenda, creadas: 0, reagendadas: 0, canceladas: 0, asistencias: 0,
      anterior: { creadas: 0, reagendadas: 0, canceladas: 0, asistencias: 0 },
    };
    mapa.set(clave, fila);
    return fila;
  };
  for (const fila of creadas.results) asegurar(fila.nombre, fila.rol, fila.agenda).creadas = num(fila.n);
  for (const fila of reagendadas.results) asegurar(fila.nombre, fila.rol, fila.agenda).reagendadas = num(fila.n);
  for (const fila of canceladas.results) asegurar(fila.nombre, fila.rol, fila.agenda).canceladas = num(fila.n);
  for (const fila of asistencias.results) asegurar(fila.nombre, fila.rol, fila.agenda).asistencias = num(fila.n);
  for (const fila of creadasAntes.results) asegurar(fila.nombre, "", fila.agenda).anterior.creadas = num(fila.n);
  for (const fila of reagendadasAntes.results) asegurar(fila.nombre, "", fila.agenda).anterior.reagendadas = num(fila.n);
  for (const fila of canceladasAntes.results) asegurar(fila.nombre, "", fila.agenda).anterior.canceladas = num(fila.n);
  for (const fila of asistenciasAntes.results) asegurar(fila.nombre, "", fila.agenda).anterior.asistencias = num(fila.n);
  return [...mapa.values()].sort((a, b) => b.creadas + b.asistencias - (a.creadas + a.asistencias)).slice(0, 12);
}

export async function armarPanel(
  db: D1Database,
  rol: Rol,
  desde: string,
  hasta: string,
  mes: string,
  ahora: Date,
  hoy: string,
): Promise<Panel> {
  const agendas = agendasDeCitas(rol);
  const claves = marcas(agendas);
  const vista = vistaDe(rol);
  const largo = Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000) + 1;
  const anteriorDesde = sumarDias(desde, -largo);
  const anteriorHasta = sumarDias(desde, -1);
  const agendaKpi = rol === "INSTRUCTOR" || rol === "OPERADOR_AGENDA" ? (rol === "INSTRUCTOR" ? "PRIMERA_VEZ" : "GENERAL") : null;
  const [hoyConteo, periodo, anterior, citasHoy, flujo, proximos, espera, actividad, inasistencias, repetidas, tramites, ocupacion, mesDias, feriados, laborables] = await Promise.all([
    conteoEstado(db, hoy, hoy, agendas),
    conteoEstado(db, desde, hasta, agendas),
    conteoEstado(db, anteriorDesde, anteriorHasta, agendas),
    db.prepare(
      `SELECT c.id, c.hora, c.estado, c.agenda_id AS agenda, c.docs_cargados AS docsCargados, c.tipo_tramite_id,
              t.requiere_carnet, t.requiere_licencia, t.nombre AS tramite, ci.rut, ci.apellidos || ', ' || ci.nombres AS nombre
       FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
       WHERE c.fecha = ? AND c.estado NOT IN ('CANCELADA','ANULADA') AND c.agenda_id IN (${claves})
       ORDER BY c.hora, c.agenda_id`,
    ).bind(hoy, ...agendas).all<CitaDia & { tipo_tramite_id: string; requiere_carnet: number; requiere_licencia: number }>(),
    db.prepare(
      `SELECT hora,
              SUM(CASE WHEN estado NOT IN ('CANCELADA','ANULADA') THEN 1 ELSE 0 END) AS citados,
              SUM(CASE WHEN estado IN ('ASISTIO','ATRASADO') THEN 1 ELSE 0 END) AS llegaron
       FROM citas WHERE fecha = ? AND agenda_id IN (${claves}) GROUP BY hora ORDER BY hora`,
    ).bind(hoy, ...agendas).all<{ hora: string; citados: number; llegaron: number }>(),
    db.prepare(
      `SELECT fecha, COUNT(*) AS citados FROM citas
       WHERE fecha > ? AND fecha <= ? AND estado = 'AGENDADA' AND agenda_id IN (${claves})
       GROUP BY fecha ORDER BY citados DESC, fecha LIMIT 5`,
    ).bind(hoy, sumarDias(hoy, 21), ...agendas).all<{ fecha: string; citados: number }>(),
    db.prepare(
      `SELECT AVG((julianday(atencion_at) - julianday(asistencia_at)) * 1440) AS minutos
       FROM citas WHERE atencion_at IS NOT NULL AND asistencia_at IS NOT NULL
         AND fecha >= ? AND fecha <= ? AND agenda_id IN (${claves})`,
    ).bind(desde, hasta, ...agendas).first<{ minutos: number | null }>(),
    actividadDe(db, desde, hasta, anteriorDesde, anteriorHasta, agendas),
    db.prepare(
      `SELECT ci.apellidos || ', ' || ci.nombres AS nombre, COUNT(*) AS n
       FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id
       WHERE c.estado = 'NO_ASISTIO' AND c.fecha >= ? AND c.fecha <= ? AND c.agenda_id IN (${claves})
       GROUP BY c.ciudadano_id ORDER BY n DESC LIMIT 5`,
    ).bind(desde, hasta, ...agendas).all<{ nombre: string; n: number }>(),
    db.prepare(
      `SELECT ci.apellidos || ', ' || ci.nombres AS nombre, COUNT(*) AS n
       FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id
       WHERE c.estado NOT IN ('CANCELADA','ANULADA') AND c.fecha >= ? AND c.fecha <= ? AND c.agenda_id IN (${claves})
       GROUP BY c.ciudadano_id HAVING COUNT(*) >= 2 ORDER BY n DESC LIMIT 5`,
    ).bind(desde, hasta, ...agendas).all<{ nombre: string; n: number }>(),
    db.prepare(
      `SELECT t.nombre, COUNT(c.id) AS citas FROM tipos_tramite t
       LEFT JOIN citas c ON c.tipo_tramite_id = t.id AND c.fecha >= ? AND c.fecha <= ?
         AND c.estado NOT IN ('CANCELADA','ANULADA') AND c.agenda_id IN (${claves})
       GROUP BY t.id HAVING COUNT(c.id) > 0 ORDER BY citas DESC LIMIT 5`,
    ).bind(desde, hasta, ...agendas).all<{ nombre: string; citas: number }>(),
    db.prepare(
      `SELECT hora, COUNT(*) AS citas FROM citas
       WHERE fecha >= ? AND fecha <= ? AND estado NOT IN ('CANCELADA','ANULADA') AND agenda_id IN (${claves})
       GROUP BY hora ORDER BY citas DESC LIMIT 6`,
    ).bind(desde, hasta, ...agendas).all<{ hora: string; citas: number }>(),
    libresPorDia(db, ahora, mes),
    feriadosDelMes(db, mes),
    diasLaborables(db),
  ]);
  const recientesRaw = await db.prepare(
    `SELECT c.creado_at AS at, COALESCE(u.nombre, 'Sin registro') AS quien, 'Creó' AS accion,
            ci.apellidos || ', ' || ci.nombres AS persona, c.agenda_id AS agenda, c.fecha, c.hora
     FROM citas c LEFT JOIN usuarios u ON u.id = c.creado_por JOIN ciudadanos ci ON ci.id = c.ciudadano_id
     WHERE c.agenda_id IN (${claves})
     UNION ALL
     SELECT COALESCE(c.asistencia_at, c.actualizado_at) AS at, COALESCE(u.nombre, 'Sin registro'), 'Asistencia',
            ci.apellidos || ', ' || ci.nombres, c.agenda_id, c.fecha, c.hora
     FROM citas c LEFT JOIN usuarios u ON u.id = c.asistencia_marcada_por JOIN ciudadanos ci ON ci.id = c.ciudadano_id
     WHERE c.asistencia_marcada_por IS NOT NULL AND c.agenda_id IN (${claves})
     ${vista === "recepcion" || vista === "admin" ? `UNION ALL
     SELECT a.llegada_at, COALESCE(u.nombre, 'Sin registro'), 'Registró sin hora', a.nombre, 'MESON', a.fecha, ''
     FROM atenciones_meson a LEFT JOIN usuarios u ON u.id = a.registrado_por` : ""}
     ORDER BY 1 DESC LIMIT 8`,
  ).bind(...agendas, ...agendas).all<Reciente>();
  const listaHoy = citasHoy.results.map((cita) => {
    const { tipo_tramite_id, requiere_carnet, requiere_licencia, ...resto } = cita;
    return {
      ...resto,
      docsCargados: num(cita.docsCargados),
      docsRequeridos: cantidadDocumentosRequeridos({ agenda_id: cita.agenda, tipo_tramite_id, requiere_carnet, requiere_licencia }),
    };
  });
  const proxima = listaHoy.find((cita) => cita.estado === "AGENDADA") ?? null;
  const huecos = [];
  if (puedeVerCupos(rol) && vista !== "recepcion") {
    const visibles = rol === "INSTRUCTOR" ? (["PRIMERA_VEZ"] as const) : rol === "OPERADOR_AGENDA" ? (["GENERAL", "PRIMERA_VEZ"] as const) : (["GENERAL", "PRIMERA_VEZ"] as const);
    for (const agenda of visibles) {
      const filas = await cuposDesdeAhora(db, agenda, ahora, { limite: 4 });
      huecos.push({ agenda, proxima: filas[0] ?? null, siguientes: filas.slice(1, 4) });
    }
  }
  const kpis = vista === "recepcion" ? null : (await armarEstadisticas(db, {
    desde, hasta, agenda: agendaKpi, tipo: null, hoy,
  })).kpis;
  const porAgenda = vista === "admin"
    ? (await db.prepare(
      `SELECT agenda_id AS agenda,
              SUM(CASE WHEN estado NOT IN ('CANCELADA','ANULADA') THEN 1 ELSE 0 END) AS total,
              SUM(CASE WHEN estado = 'ASISTIO' THEN 1 ELSE 0 END) AS asistieron,
              SUM(CASE WHEN estado = 'NO_ASISTIO' THEN 1 ELSE 0 END) AS noAsistieron,
              SUM(CASE WHEN estado = 'ATRASADO' THEN 1 ELSE 0 END) AS atrasados
       FROM citas WHERE fecha >= ? AND fecha <= ? GROUP BY agenda_id`,
    ).bind(desde, hasta).all<{ agenda: string; total: number; asistieron: number; noAsistieron: number; atrasados: number }>()).results.map((fila) => ({
      agenda: fila.agenda,
      total: num(fila.total),
      asistieron: num(fila.asistieron),
      noAsistieron: num(fila.noAsistieron),
      atrasados: num(fila.atrasados),
    }))
    : [];
  const minutos = espera?.minutos;
  return {
    vista,
    agendas,
    puedeAgendar: puedeCrearCita(rol, "GENERAL"),
    exportar: puedeExportar(rol),
    hoy: {
      fecha: hoy,
      ...hoyConteo,
      faltan: hoyConteo.citados - hoyConteo.llegaron - hoyConteo.inasistencias,
      proxima: proxima ? { id: proxima.id, hora: proxima.hora, nombre: proxima.nombre, tramite: proxima.tramite, docsCargados: proxima.docsCargados, docsRequeridos: proxima.docsRequeridos } : null,
      docsPendientes: listaHoy.filter((cita) => cita.docsRequeridos > 0 && cita.docsCargados < cita.docsRequeridos && cita.estado !== "NO_ASISTIO").length,
      citas: listaHoy,
    },
    periodo: {
      ...periodo,
      esperaMin: minutos === null || minutos === undefined || Number.isNaN(Number(minutos)) ? null : Math.round(Number(minutos)),
      anterior,
    },
    flujo: flujo.results.map((fila) => ({ hora: fila.hora, citados: num(fila.citados), llegaron: num(fila.llegaron) })),
    proximosDias: proximos.results.map((fila) => ({ fecha: fila.fecha, citados: num(fila.citados) })),
    huecos,
    kpis,
    kpisPorAgenda: porAgenda,
    mes: {
      mes,
      dias: mesDias.filter((fila) => agendas.includes(fila.agenda as AgendaId) && (vista !== "operador" || fila.agenda === "GENERAL") && (vista !== "instructor" || fila.agenda === "PRIMERA_VEZ")),
      feriados,
      laborables,
    },
    actividad: { filas: actividad, recientes: recientesRaw.results },
    relevantes: {
      inasistencias: inasistencias.results.map((fila) => ({ nombre: fila.nombre, n: num(fila.n) })),
      repetidas: repetidas.results.map((fila) => ({ nombre: fila.nombre, n: num(fila.n) })),
      tramites: vista === "recepcion" ? [] : tramites.results.map((fila) => ({ nombre: fila.nombre, citas: num(fila.citas) })),
      ocupacion: ocupacion.results.map((fila) => ({ hora: fila.hora, citas: num(fila.citas) })),
    },
  };
}
