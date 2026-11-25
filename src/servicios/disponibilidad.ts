import { partesEnZona } from "../domain/tiempo";

const ZONA = "America/Santiago";

export interface CupoLibre {
  fecha: string;
  hora: string;
  libres: number;
}

export async function cuposDesdeAhora(
  db: D1Database,
  agenda: string,
  ahora: Date,
  opciones: { limite?: number; dia?: string; desde?: string; soloManana?: boolean } = {},
): Promise<CupoLibre[]> {
  const local = partesEnZona(ahora, ZONA);
  const dia = opciones.dia ?? "";
  const desde = dia || (opciones.desde && opciones.desde > local.fecha ? opciones.desde : local.fecha);
  const limite = opciones.limite ?? 8;
  const filas = await db.prepare(
    `SELECT b.fecha, b.hora, (b.capacidad - b.usados) AS libres
     FROM cupos_bloque b
     JOIN cupos_dia d ON d.agenda_id = b.agenda_id AND d.fecha = b.fecha
     WHERE b.agenda_id = ?
       AND b.usados < b.capacidad
       AND d.usados < d.capacidad
       AND NOT EXISTS (SELECT 1 FROM feriados f WHERE f.fecha = b.fecha)
       AND NOT EXISTS (
         SELECT 1 FROM excepciones_dia e
         WHERE e.agenda_id = b.agenda_id AND e.fecha = b.fecha AND e.tipo = 'BLOQUEO'
       )
       AND (b.fecha > ? OR (b.fecha = ? AND b.hora > ?))
       AND b.fecha >= ?
       AND (? = '' OR b.fecha = ?)
       AND (? = 0 OR b.hora < '12:00')
     ORDER BY b.fecha, b.hora
     LIMIT ?`,
  ).bind(
    agenda,
    local.fecha,
    local.fecha,
    local.hora,
    desde,
    dia,
    dia,
    opciones.soloManana ? 1 : 0,
    limite,
  ).all<CupoLibre>();
  return filas.results;
}

export interface DiaLibre {
  agenda: string;
  fecha: string;
  libres: number;
}

export async function diasLaborables(db: D1Database, agenda?: string): Promise<number[]> {
  const filas = agenda
    ? await db.prepare("SELECT DISTINCT dia_semana AS dia FROM horarios_semanales WHERE agenda_id = ? ORDER BY dia").bind(agenda).all<{ dia: number }>()
    : await db.prepare("SELECT DISTINCT dia_semana AS dia FROM horarios_semanales ORDER BY dia").all<{ dia: number }>();
  const dias = filas.results.map((fila) => Number(fila.dia)).filter((dia) => dia >= 1 && dia <= 7);
  return dias.length > 0 ? dias : [1, 2, 3, 4, 5];
}

export async function libresPorDia(db: D1Database, ahora: Date, mes: string): Promise<DiaLibre[]> {
  const local = partesEnZona(ahora, ZONA);
  const desde = `${mes}-01`;
  const [anio, numero] = mes.split("-").map(Number);
  const hasta = new Date(Date.UTC(anio, numero, 1)).toISOString().slice(0, 10);
  const filas = await db.prepare(
    `SELECT b.agenda_id AS agenda, b.fecha, SUM(b.capacidad - b.usados) AS libres
     FROM cupos_bloque b
     JOIN cupos_dia d ON d.agenda_id = b.agenda_id AND d.fecha = b.fecha
     WHERE b.fecha >= ? AND b.fecha < ?
       AND b.usados < b.capacidad
       AND d.usados < d.capacidad
       AND NOT EXISTS (SELECT 1 FROM feriados f WHERE f.fecha = b.fecha)
       AND NOT EXISTS (
         SELECT 1 FROM excepciones_dia e
         WHERE e.agenda_id = b.agenda_id AND e.fecha = b.fecha AND e.tipo = 'BLOQUEO'
       )
       AND (b.fecha > ? OR (b.fecha = ? AND b.hora > ?))
     GROUP BY b.agenda_id, b.fecha
     ORDER BY b.agenda_id, b.fecha`,
  ).bind(desde, hasta, local.fecha, local.fecha, local.hora).all<DiaLibre>();
  return filas.results.map((fila) => ({ ...fila, libres: Number(fila.libres) }));
}
