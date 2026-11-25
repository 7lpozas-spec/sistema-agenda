import { cambios } from "../data/sql";
import { bloquePosterior, minutosDeHora, partesEnZona } from "../domain/tiempo";
import { ErrorApp } from "../http/error";
import { bloquesDeTipo, horasConsecutivas } from "./reservas";
import { cuposDesdeAhora, type CupoLibre } from "./disponibilidad";

export interface Afectada {
  id: string;
  hora: string;
  nombre: string;
}

export interface Propuesta {
  citaId: string;
  nombre: string;
  horaActual: string;
  fecha: string;
  hora: string;
}

export function asignarHuecos(citas: Afectada[], huecos: CupoLibre[]): Propuesta[] {
  const restos = huecos.map((hueco) => ({ ...hueco, quedan: hueco.libres }));
  const propuestas: Propuesta[] = [];
  for (const cita of citas) {
    const hueco = restos.find((item) => item.quedan > 0);
    if (!hueco) continue;
    hueco.quedan -= 1;
    propuestas.push({ citaId: cita.id, nombre: cita.nombre, horaActual: cita.hora, fecha: hueco.fecha, hora: hueco.hora });
  }
  return propuestas;
}

export async function proponerTrasCierre(
  db: D1Database,
  agenda: string,
  ahora: Date,
  citas: Afectada[],
  excluir?: { fecha: string; hora?: string | null },
): Promise<Propuesta[]> {
  const huecos = await cuposDesdeAhora(db, agenda, ahora, { limite: 80 });
  const libres = excluir
    ? huecos.filter((hueco) => hueco.fecha !== excluir.fecha || (excluir.hora ? hueco.hora !== excluir.hora : false))
    : huecos;
  return asignarHuecos(citas, libres);
}

export async function citasDelCierre(db: D1Database, agenda: string, fecha: string, hora: string | null): Promise<Afectada[]> {
  const filtroHora = hora ? " AND c.hora = ?" : "";
  const afectadas = await db.prepare(
    `SELECT c.id, c.hora, ci.nombres, ci.apellidos FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id
     WHERE c.agenda_id = ? AND c.fecha = ? AND c.estado = 'AGENDADA'${filtroHora} ORDER BY c.hora, ci.apellidos`,
  ).bind(...(hora ? [agenda, fecha, hora] : [agenda, fecha])).all<{ id: string; hora: string; nombres: string; apellidos: string }>();
  return afectadas.results.map((fila) => ({ id: fila.id, hora: fila.hora, nombre: `${fila.apellidos}, ${fila.nombres}` }));
}

export interface MovimientoCierre {
  citaId: string;
  fecha: string;
  hora: string;
}

/** Bloquea el día o el bloque y mueve las citas en un solo lote. Si falla, no queda nada escrito. */
export async function confirmarCierre(
  db: D1Database,
  input: { agenda: string; fecha: string; hora: string | null; motivo: string | null; movimientos: MovimientoCierre[]; usuarioId: string },
): Promise<{ reubicadas: number }> {
  const afectadas = await citasDelCierre(db, input.agenda, input.fecha, input.hora);
  const porId = new Map(afectadas.map((cita) => [cita.id, cita]));
  const vistos = new Set<string>();
  const movimientos = input.movimientos.filter((mov) => {
    if (vistos.has(mov.citaId) || !porId.has(mov.citaId)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(mov.fecha) || !/^\d{2}:\d{2}$/.test(mov.hora)) return false;
    vistos.add(mov.citaId);
    return true;
  });
  if (movimientos.length !== input.movimientos.length) {
    throw new ErrorApp(400, "DATO_INVALIDO", "Hay una reubicación que no corresponde a una cita de ese cierre.");
  }
  const detalles = new Map<string, { cantidad: number; bloques: number; duracion: number; origen: string }>();
  for (const mov of movimientos) {
    const fila = await db.prepare(
      `SELECT c.hora, t.duracion_slot_min AS duracion, t.cupos_que_consume AS cantidad, a.duracion_bloque_min AS bloque
       FROM citas c JOIN tipos_tramite t ON t.id = c.tipo_tramite_id JOIN agendas a ON a.id = c.agenda_id
       WHERE c.id = ? AND c.estado = 'AGENDADA'`,
    ).bind(mov.citaId).first<{ hora: string; duracion: number | null; cantidad: number; bloque: number }>();
    if (!fila) throw new ErrorApp(409, "ESTADO_INVALIDO", "Una cita ya no se puede reubicar.");
    detalles.set(mov.citaId, {
      cantidad: fila.cantidad || 1,
      bloques: bloquesDeTipo(fila.duracion, fila.bloque),
      duracion: fila.bloque,
      origen: fila.hora,
    });
  }
  const menosBloque = new Map<string, number>();
  const masBloque = new Map<string, number>();
  const menosDia = new Map<string, number>();
  const masDia = new Map<string, number>();
  function sumar(mapa: Map<string, number>, clave: string, n: number) {
    mapa.set(clave, (mapa.get(clave) ?? 0) + n);
  }
  for (const mov of movimientos) {
    const detalle = detalles.get(mov.citaId)!;
    const origenHoras = horasConsecutivas(detalle.origen, detalle.bloques, detalle.duracion);
    const destinoHoras = horasConsecutivas(mov.hora, detalle.bloques, detalle.duracion);
    for (const hora of origenHoras) sumar(menosBloque, `${input.agenda}|${input.fecha}|${hora}`, detalle.cantidad);
    for (const hora of destinoHoras) sumar(masBloque, `${input.agenda}|${mov.fecha}|${hora}`, detalle.cantidad);
    if (mov.fecha !== input.fecha) {
      sumar(menosDia, `${input.agenda}|${input.fecha}`, detalle.cantidad);
      sumar(masDia, `${input.agenda}|${mov.fecha}`, detalle.cantidad);
    }
    for (const hora of destinoHoras) {
      const existe = await db.prepare("SELECT 1 AS n FROM cupos_bloque WHERE agenda_id = ? AND fecha = ? AND hora = ?").bind(input.agenda, mov.fecha, hora).first();
      if (!existe) throw new ErrorApp(409, "SIN_CUPO", "No hay cupo en el horario nuevo. No se cambió nada.");
    }
    const dia = await db.prepare("SELECT 1 AS n FROM cupos_dia WHERE agenda_id = ? AND fecha = ?").bind(input.agenda, mov.fecha).first();
    if (!dia) throw new ErrorApp(409, "SIN_CUPO", "No hay cupo en el día nuevo. No se cambió nada.");
  }
  const ahora = new Date().toISOString();
  const ordenes: D1PreparedStatement[] = [];
  for (const [clave, n] of menosBloque) {
    const [, fecha, hora] = clave.split("|");
    ordenes.push(db.prepare("UPDATE cupos_bloque SET usados = usados - ? WHERE agenda_id = ? AND fecha = ? AND hora = ?").bind(n, input.agenda, fecha, hora));
  }
  for (const [clave, n] of menosDia) {
    const [, fecha] = clave.split("|");
    ordenes.push(db.prepare("UPDATE cupos_dia SET usados = usados - ? WHERE agenda_id = ? AND fecha = ?").bind(n, input.agenda, fecha));
  }
  for (const [clave, n] of masBloque) {
    const [, fecha, hora] = clave.split("|");
    ordenes.push(db.prepare("UPDATE cupos_bloque SET usados = usados + ? WHERE agenda_id = ? AND fecha = ? AND hora = ?").bind(n, input.agenda, fecha, hora));
  }
  for (const [clave, n] of masDia) {
    const [, fecha] = clave.split("|");
    ordenes.push(db.prepare("UPDATE cupos_dia SET usados = usados + ? WHERE agenda_id = ? AND fecha = ?").bind(n, input.agenda, fecha));
  }
  if (input.hora) {
    ordenes.push(db.prepare("UPDATE cupos_bloque SET capacidad = usados WHERE agenda_id = ? AND fecha = ? AND hora = ?").bind(input.agenda, input.fecha, input.hora));
  } else {
    ordenes.push(db.prepare("UPDATE cupos_bloque SET capacidad = usados WHERE agenda_id = ? AND fecha = ? AND usados < capacidad").bind(input.agenda, input.fecha));
    ordenes.push(db.prepare("UPDATE cupos_dia SET capacidad = usados WHERE agenda_id = ? AND fecha = ?").bind(input.agenda, input.fecha));
    ordenes.push(db.prepare(
      "INSERT INTO excepciones_dia (id, agenda_id, fecha, tipo, motivo, creado_at) VALUES (?, ?, ?, 'BLOQUEO', ?, ?)",
    ).bind(crypto.randomUUID(), input.agenda, input.fecha, input.motivo ?? "Cierre", ahora));
  }
  for (const mov of movimientos) {
    ordenes.push(db.prepare(
      "UPDATE citas SET fecha = ?, hora = ?, actualizado_por = ?, actualizado_at = ? WHERE id = ? AND estado = 'AGENDADA'",
    ).bind(mov.fecha, mov.hora, input.usuarioId, ahora, mov.citaId));
    ordenes.push(db.prepare(
      "INSERT INTO cita_historial (id, cita_id, evento, antes, despues, usuario_id, at) VALUES (?, ?, 'REAGENDADA', ?, ?, ?, ?)",
    ).bind(
      crypto.randomUUID(),
      mov.citaId,
      JSON.stringify({ fecha: input.fecha, hora: porId.get(mov.citaId)?.hora }),
      JSON.stringify({ fecha: mov.fecha, hora: mov.hora, origen: "reubicacion" }),
      input.usuarioId,
      ahora,
    ));
  }
  try {
    if (ordenes.length > 0) await db.batch(ordenes);
  } catch {
    throw new ErrorApp(409, "SIN_CUPO", "No se pudo cerrar: un cupo ya no está libre. No se cambió nada.");
  }
  return { reubicadas: movimientos.length };
}

/** Marca inasistencias de días ya terminados y del día de hoy si pasó la gracia tras el último bloque. */
export async function cerrarJornadasAutomaticas(db: D1Database, ahora: Date, graciaMinutos: number): Promise<number> {
  const local = partesEnZona(ahora, "America/Santiago");
  const marca = ahora.toISOString();
  const pasado = await db.prepare(
    `UPDATE citas SET estado = 'NO_ASISTIO', asistencia_at = COALESCE(asistencia_at, ?), actualizado_at = ?
     WHERE estado = 'AGENDADA' AND fecha < ?`,
  ).bind(marca, marca, local.fecha).run();
  const horarios = await db.prepare(
    "SELECT agenda_id, MAX(hora_fin) AS hora_fin FROM horarios_semanales WHERE dia_semana = ? GROUP BY agenda_id",
  ).bind(local.diaIso).all<{ agenda_id: string; hora_fin: string }>();
  const gracia = Number.isFinite(graciaMinutos) ? graciaMinutos : 30;
  let hoy = 0;
  for (const fila of horarios.results) {
    const fin = minutosDeHora(fila.hora_fin.slice(0, 5));
    if (local.minutoDelDia < fin + gracia) continue;
    const resultado = await db.prepare(
      `UPDATE citas SET estado = 'NO_ASISTIO', asistencia_at = COALESCE(asistencia_at, ?), actualizado_at = ?
       WHERE estado = 'AGENDADA' AND fecha = ? AND agenda_id = ?`,
    ).bind(marca, marca, local.fecha, fila.agenda_id).run();
    hoy += cambios(resultado);
  }
  return cambios(pasado) + hoy;
}

/** Marca inasistencia solo en bloques cuya hora ya empezó. */
export async function marcarInasistenciasVencidas(db: D1Database, fecha: string, ahora: Date, usuarioId: string | null): Promise<number> {
  const local = partesEnZona(ahora, "America/Santiago");
  if (fecha > local.fecha) return 0;
  const corte = fecha < local.fecha ? "99:99" : local.hora;
  const filas = await db.prepare(
    "SELECT id, hora FROM citas WHERE fecha = ? AND estado = 'AGENDADA'",
  ).bind(fecha).all<{ id: string; hora: string }>();
  const vencidas = filas.results.filter((fila) => fecha < local.fecha || !bloquePosterior(fecha, fila.hora, ahora));
  if (corte && vencidas.length === 0) return 0;
  const marca = ahora.toISOString();
  for (const fila of vencidas) {
    await db.prepare(
      "UPDATE citas SET estado = 'NO_ASISTIO', asistencia_at = ?, asistencia_marcada_por = ?, actualizado_at = ? WHERE id = ? AND estado = 'AGENDADA'",
    ).bind(marca, usuarioId, marca, fila.id).run();
  }
  return vencidas.length;
}
