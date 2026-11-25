import { esAgenda } from "../domain/catalogo";
import { fechaValida, sumarDias } from "../domain/tiempo";
import { ErrorApp } from "../http/error";

export interface FiltroEstadistica {
  desde: string;
  hasta: string;
  agenda: string | null;
  tipo: string | null;
  hoy: string;
}

export interface Estadisticas {
  desde: string;
  hasta: string;
  hoy: string;
  kpis: {
    hoy: number;
    semana: number;
    semanaAnterior: number;
    mes: number;
    periodo: number;
    asistieron: number;
    noAsistieron: number;
    atrasados: number;
    canceladas: number;
    anuladas: number;
    agendadas: number;
    total: number;
    tasa: number | null;
    anterior: {
      total: number;
      asistieron: number;
      noAsistieron: number;
      atrasados: number;
      canceladas: number;
      tasa: number | null;
    };
  };
  ocupacion: { agenda: string; capacidad: number; usados: number; porcentaje: number }[];
  porTipo: { id: string; nombre: string; citas: number }[];
  porOperador: { nombre: string; citas: number }[];
  serie: { fecha: string; citas: number }[];
  calor: { dia: number; hora: string; citas: number }[];
}

export function filtroDe(query: { desde?: string; hasta?: string; agenda?: string; tipo?: string }, hoy: string): FiltroEstadistica {
  const desde = query.desde && fechaValida(query.desde) ? query.desde : `${hoy.slice(0, 7)}-01`;
  const hasta = query.hasta && fechaValida(query.hasta) ? query.hasta : hoy;
  if (desde > hasta) throw new ErrorApp(400, "DATO_INVALIDO", "La fecha inicial no puede ser posterior a la final.");
  if (hasta > sumarDias(desde, 370)) throw new ErrorApp(400, "DATO_INVALIDO", "El rango no puede superar un año.");
  const agenda = query.agenda && esAgenda(query.agenda) ? query.agenda : null;
  const tipo = query.tipo && /^[A-Z0-9_]{3,40}$/.test(query.tipo) ? query.tipo : null;
  return { desde, hasta, agenda, tipo, hoy };
}

function inicioSemana(fecha: string): string {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  const retroceso = semana === 0 ? 6 : semana - 1;
  return sumarDias(fecha, -retroceso);
}

function finDeMes(fecha: string): string {
  const [anio, mes] = fecha.split("-").map(Number);
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${fecha.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`;
}

function diaSemana(fecha: string): number {
  const [anio, mes, dia] = fecha.split("-").map(Number);
  const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return semana === 0 ? 7 : semana;
}

async function contar(db: D1Database, desde: string, hasta: string, filtro: FiltroEstadistica, extra = ""): Promise<number> {
  const fila = await db.prepare(
    `SELECT COUNT(*) AS n FROM citas c
     WHERE c.fecha >= ? AND c.fecha <= ?
       AND (? IS NULL OR c.agenda_id = ?)
       AND (? IS NULL OR c.tipo_tramite_id = ?)
       ${extra}`,
  ).bind(desde, hasta, filtro.agenda, filtro.agenda, filtro.tipo, filtro.tipo).first<{ n: number }>();
  return fila?.n ?? 0;
}

export async function armarEstadisticas(db: D1Database, filtro: FiltroEstadistica): Promise<Estadisticas> {
  const semanaDesde = inicioSemana(filtro.hoy);
  const mesDesde = `${filtro.hoy.slice(0, 7)}-01`;
  const mesHasta = finDeMes(filtro.hoy);
  const largo = Math.round((Date.parse(`${filtro.hasta}T00:00:00Z`) - Date.parse(`${filtro.desde}T00:00:00Z`)) / 86_400_000) + 1;
  const anteriorDesde = sumarDias(filtro.desde, -largo);
  const anteriorHasta = sumarDias(filtro.desde, -1);
  const [hoy, semana, semanaAnterior, mes, periodo, asistieron, noAsistieron, atrasados, canceladas, anuladas, agendadas, previos] = await Promise.all([
    contar(db, filtro.hoy, filtro.hoy, filtro, "AND c.estado NOT IN ('CANCELADA','ANULADA')"),
    contar(db, semanaDesde, sumarDias(semanaDesde, 6), filtro, "AND c.estado NOT IN ('CANCELADA','ANULADA')"),
    contar(db, sumarDias(semanaDesde, -7), sumarDias(semanaDesde, -1), filtro, "AND c.estado NOT IN ('CANCELADA','ANULADA')"),
    contar(db, mesDesde, mesHasta, filtro, "AND c.estado NOT IN ('CANCELADA','ANULADA')"),
    contar(db, filtro.desde, filtro.hasta, filtro, "AND c.estado NOT IN ('CANCELADA','ANULADA')"),
    contar(db, filtro.desde, filtro.hasta, filtro, "AND c.estado = 'ASISTIO'"),
    contar(db, filtro.desde, filtro.hasta, filtro, "AND c.estado = 'NO_ASISTIO'"),
    contar(db, filtro.desde, filtro.hasta, filtro, "AND c.estado = 'ATRASADO'"),
    contar(db, filtro.desde, filtro.hasta, filtro, "AND c.estado = 'CANCELADA'"),
    contar(db, filtro.desde, filtro.hasta, filtro, "AND c.estado = 'ANULADA'"),
    contar(db, filtro.desde, filtro.hasta, filtro, "AND c.estado = 'AGENDADA'"),
    db.prepare(
      `SELECT c.estado, COUNT(*) AS n FROM citas c
       WHERE c.fecha >= ? AND c.fecha <= ?
         AND (? IS NULL OR c.agenda_id = ?)
         AND (? IS NULL OR c.tipo_tramite_id = ?)
       GROUP BY c.estado`,
    ).bind(anteriorDesde, anteriorHasta, filtro.agenda, filtro.agenda, filtro.tipo, filtro.tipo).all<{ estado: string; n: number }>(),
  ]);
  const previo = new Map(previos.results.map((fila) => [fila.estado, Number(fila.n)]));
  const tomar = (mapa: Map<string, number>, estado: string) => mapa.get(estado) ?? 0;
  const asistieronAntes = tomar(previo, "ASISTIO");
  const noAntes = tomar(previo, "NO_ASISTIO");
  const atrasadosAntes = tomar(previo, "ATRASADO");
  const canceladasAntes = tomar(previo, "CANCELADA");
  const total = asistieron + noAsistieron + atrasados + canceladas + agendadas;
  const totalAntes = [...previo.values()].reduce((suma, n) => suma + n, 0) - tomar(previo, "ANULADA");
  const tasaDe = (si: number, no: number, tarde: number) => {
    const base = si + no + tarde;
    return base > 0 ? Math.round((si / base) * 100) : null;
  };
  const ocupacion = await db.prepare(
    `SELECT agenda_id AS agenda, SUM(capacidad) AS capacidad, SUM(usados) AS usados
     FROM cupos_dia WHERE fecha >= ? AND fecha <= ? AND (? IS NULL OR agenda_id = ?)
     GROUP BY agenda_id ORDER BY agenda_id`,
  ).bind(semanaDesde, sumarDias(semanaDesde, 5), filtro.agenda, filtro.agenda).all<{ agenda: string; capacidad: number; usados: number }>();
  const porTipo = await db.prepare(
    `SELECT t.id, t.nombre, COUNT(c.id) AS citas
     FROM tipos_tramite t
     LEFT JOIN citas c ON c.tipo_tramite_id = t.id AND c.fecha >= ? AND c.fecha <= ?
       AND c.estado NOT IN ('CANCELADA','ANULADA')
       AND (? IS NULL OR c.agenda_id = ?)
     WHERE (? IS NULL OR t.id = ?)
     GROUP BY t.id ORDER BY t.orden`,
  ).bind(filtro.desde, filtro.hasta, filtro.agenda, filtro.agenda, filtro.tipo, filtro.tipo).all<{ id: string; nombre: string; citas: number }>();
  const porOperador = await db.prepare(
    `SELECT COALESCE(u.nombre, 'Sin operador') AS nombre, COUNT(*) AS citas
     FROM citas c LEFT JOIN usuarios u ON u.id = c.creado_por
     WHERE c.fecha >= ? AND c.fecha <= ? AND c.estado NOT IN ('CANCELADA','ANULADA')
       AND (? IS NULL OR c.agenda_id = ?) AND (? IS NULL OR c.tipo_tramite_id = ?)
     GROUP BY u.nombre ORDER BY citas DESC`,
  ).bind(filtro.desde, filtro.hasta, filtro.agenda, filtro.agenda, filtro.tipo, filtro.tipo).all<{ nombre: string; citas: number }>();
  const serie = await db.prepare(
    `SELECT fecha, COUNT(*) AS citas FROM citas c
     WHERE c.fecha >= ? AND c.fecha <= ? AND c.estado NOT IN ('CANCELADA','ANULADA')
       AND (? IS NULL OR c.agenda_id = ?) AND (? IS NULL OR c.tipo_tramite_id = ?)
     GROUP BY fecha ORDER BY fecha`,
  ).bind(filtro.desde, filtro.hasta, filtro.agenda, filtro.agenda, filtro.tipo, filtro.tipo).all<{ fecha: string; citas: number }>();
  const bloques = await db.prepare(
    `SELECT fecha, hora, COUNT(*) AS citas FROM citas c
     WHERE c.fecha >= ? AND c.fecha <= ? AND c.estado NOT IN ('CANCELADA','ANULADA')
       AND (? IS NULL OR c.agenda_id = ?) AND (? IS NULL OR c.tipo_tramite_id = ?)
     GROUP BY fecha, hora`,
  ).bind(filtro.desde, filtro.hasta, filtro.agenda, filtro.agenda, filtro.tipo, filtro.tipo).all<{ fecha: string; hora: string; citas: number }>();
  const calorMapa = new Map<string, { suma: number; dias: number }>();
  for (const bloque of bloques.results) {
    const clave = `${diaSemana(bloque.fecha)}|${bloque.hora}`;
    const grupo = calorMapa.get(clave) ?? { suma: 0, dias: 0 };
    grupo.suma += bloque.citas;
    grupo.dias += 1;
    calorMapa.set(clave, grupo);
  }
  const calor = [...calorMapa.entries()].map(([clave, grupo]) => {
    const [dia, hora] = clave.split("|");
    return { dia: Number(dia), hora, citas: Math.round(grupo.suma / grupo.dias) };
  });
  return {
    desde: filtro.desde,
    hasta: filtro.hasta,
    hoy: filtro.hoy,
    kpis: {
      hoy, semana, semanaAnterior, mes, periodo, asistieron, noAsistieron, atrasados, canceladas, anuladas, agendadas,
      total,
      tasa: tasaDe(asistieron, noAsistieron, atrasados),
      anterior: {
        total: totalAntes,
        asistieron: asistieronAntes,
        noAsistieron: noAntes,
        atrasados: atrasadosAntes,
        canceladas: canceladasAntes,
        tasa: tasaDe(asistieronAntes, noAntes, atrasadosAntes),
      },
    },
    ocupacion: ocupacion.results.map((fila) => ({
      agenda: fila.agenda,
      capacidad: fila.capacidad,
      usados: fila.usados,
      porcentaje: fila.capacidad > 0 ? Math.round((fila.usados / fila.capacidad) * 100) : 0,
    })),
    porTipo: porTipo.results,
    porOperador: porOperador.results,
    serie: serie.results,
    calor,
  };
}

export async function listadoCitas(db: D1Database, filtro: FiltroEstadistica) {
  return db.prepare(
    `SELECT c.fecha, c.hora, c.agenda_id, c.estado, c.canal, c.es_sobrecupo, t.nombre AS tramite,
            ci.rut, ci.nombres, ci.apellidos, COALESCE(u.nombre, '') AS operador
     FROM citas c
     JOIN ciudadanos ci ON ci.id = c.ciudadano_id
     JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
     LEFT JOIN usuarios u ON u.id = c.creado_por
     WHERE c.fecha >= ? AND c.fecha <= ?
       AND (? IS NULL OR c.agenda_id = ?)
       AND (? IS NULL OR c.tipo_tramite_id = ?)
     ORDER BY c.fecha, c.hora`,
  ).bind(filtro.desde, filtro.hasta, filtro.agenda, filtro.agenda, filtro.tipo, filtro.tipo).all<{
    fecha: string; hora: string; agenda_id: string; estado: string; canal: string; es_sobrecupo: number;
    tramite: string; rut: string; nombres: string; apellidos: string; operador: string;
  }>();
}
