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
  ocupados: number;
  atendidas: number;
  feriado: boolean;
}

export async function diasLaborables(db: D1Database, agenda?: string): Promise<number[]> {
  const filas = agenda
    ? await db.prepare("SELECT DISTINCT dia_semana AS dia FROM horarios_semanales WHERE agenda_id = ? ORDER BY dia").bind(agenda).all<{ dia: number }>()
    : await db.prepare("SELECT DISTINCT dia_semana AS dia FROM horarios_semanales ORDER BY dia").all<{ dia: number }>();
  const dias = filas.results.map((fila) => Number(fila.dia)).filter((dia) => dia >= 1 && dia <= 7);
  return dias.length > 0 ? dias : [1, 2, 3, 4, 5];
}

function corteMes(mes: string): { desde: string; hasta: string } {
  const desde = `${mes}-01`;
  const [anio, numero] = mes.split("-").map(Number);
  const hasta = new Date(Date.UTC(anio, numero, 1)).toISOString().slice(0, 10);
  return { desde, hasta };
}

export async function feriadosDelMes(db: D1Database, mes: string): Promise<string[]> {
  const { desde, hasta } = corteMes(mes);
  const filas = await db.prepare("SELECT fecha FROM feriados WHERE fecha >= ? AND fecha < ? ORDER BY fecha")
    .bind(desde, hasta).all<{ fecha: string }>();
  return filas.results.map((fila) => fila.fecha);
}

interface FilaMes {
  agenda: string;
  fecha: string;
  capacidad: number;
  usados: number;
  feriado: number;
  bloqueado: number;
  libres_bloque: number;
  atendidas: number;
  ocupados: number;
}

export async function libresPorDia(db: D1Database, ahora: Date, mes: string): Promise<DiaLibre[]> {
  const local = partesEnZona(ahora, ZONA);
  const { desde, hasta } = corteMes(mes);
  const filas = await db.prepare(
    `SELECT d.agenda_id AS agenda, d.fecha, d.capacidad, d.usados,
            CASE WHEN f.fecha IS NOT NULL THEN 1 ELSE 0 END AS feriado,
            CASE WHEN EXISTS (
              SELECT 1 FROM excepciones_dia e
              WHERE e.agenda_id = d.agenda_id AND e.fecha = d.fecha AND e.tipo = 'BLOQUEO'
            ) THEN 1 ELSE 0 END AS bloqueado,
            COALESCE((
              SELECT SUM(b.capacidad - b.usados)
              FROM cupos_bloque b
              WHERE b.agenda_id = d.agenda_id AND b.fecha = d.fecha
                AND b.usados < b.capacidad
                AND d.usados < d.capacidad
                AND f.fecha IS NULL
                AND NOT EXISTS (
                  SELECT 1 FROM excepciones_dia e
                  WHERE e.agenda_id = d.agenda_id AND e.fecha = d.fecha AND e.tipo = 'BLOQUEO'
                )
                AND (b.fecha > ? OR (b.fecha = ? AND b.hora > ?))
            ), 0) AS libres_bloque,
            COALESCE((
              SELECT SUM(CASE WHEN c.estado IN ('ASISTIO', 'ATRASADO') THEN 1 ELSE 0 END)
              FROM citas c
              WHERE c.agenda_id = d.agenda_id AND c.fecha = d.fecha
                AND c.estado NOT IN ('CANCELADA', 'ANULADA')
            ), 0) AS atendidas,
            COALESCE((
              SELECT COUNT(*)
              FROM citas c
              WHERE c.agenda_id = d.agenda_id AND c.fecha = d.fecha
                AND c.estado NOT IN ('CANCELADA', 'ANULADA')
            ), 0) AS ocupados
     FROM cupos_dia d
     LEFT JOIN feriados f ON f.fecha = d.fecha
     WHERE d.fecha >= ? AND d.fecha < ?
     ORDER BY d.agenda_id, d.fecha`,
  ).bind(local.fecha, local.fecha, local.hora, desde, hasta).all<FilaMes>();
  return filas.results.map((fila) => {
    const cerrado = Number(fila.feriado) === 1 || Number(fila.bloqueado) === 1;
    const resto = Math.max(0, Number(fila.capacidad) - Number(fila.usados));
    return {
      agenda: fila.agenda,
      fecha: fila.fecha,
      libres: cerrado ? 0 : Math.min(Number(fila.libres_bloque), resto),
      ocupados: Number(fila.ocupados),
      atendidas: Number(fila.atendidas),
      feriado: Number(fila.feriado) === 1,
    };
  });
}
