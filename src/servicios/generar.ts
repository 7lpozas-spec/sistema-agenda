import type { AgendaId } from "../domain/catalogo";
import { generarDias, type PlantillaDia } from "../domain/cupos";
import { partesEnZona, sumarDias } from "../domain/tiempo";

const POR_LOTE = 24;

interface Pieza {
  agendaId: string;
  fecha: string;
  hora: string | null;
  capacidad: number;
  cupoDiario: number;
}

export async function publicarCuposLote(db: D1Database, ahora = new Date()): Promise<{ escritos: number; pendiente: boolean }> {
  const [agendas, horarios, feriados, bloqueos, ausencias, parametro, cursorFila] = await Promise.all([
    db.prepare("SELECT id, duracion_bloque_min, ventana_dias FROM agendas WHERE activa = 1").all<{
      id: AgendaId;
      duracion_bloque_min: number;
      ventana_dias: number;
    }>(),
    db.prepare(
      "SELECT agenda_id, dia_semana, hora_inicio, hora_fin, cupos_por_bloque, cupo_diario FROM horarios_semanales",
    ).all<{
      agenda_id: AgendaId;
      dia_semana: number;
      hora_inicio: string;
      hora_fin: string;
      cupos_por_bloque: number;
      cupo_diario: number;
    }>(),
    db.prepare("SELECT fecha FROM feriados").all<{ fecha: string }>(),
    db.prepare("SELECT agenda_id, fecha FROM excepciones_dia WHERE tipo = 'BLOQUEO'").all<{ agenda_id: string; fecha: string }>(),
    db.prepare("SELECT fecha FROM disponibilidad_examinador WHERE estado = 'AUSENTE'").all<{ fecha: string }>(),
    db.prepare("SELECT valor FROM parametros WHERE clave = 'examenes_por_hora'").first<{ valor: string }>(),
    db.prepare("SELECT valor FROM parametros WHERE clave = 'cupos_cursor'").first<{ valor: string }>(),
  ]);
  const hoy = partesEnZona(ahora, "America/Santiago").fecha;
  const festivos = new Set(feriados.results.map((fila) => fila.fecha));
  const piezas: Pieza[] = [];
  for (const agenda of agendas.results) {
    const plantillas: PlantillaDia[] = horarios.results
      .filter((fila) => fila.agenda_id === agenda.id)
      .map((fila) => ({
        agendaId: agenda.id,
        diaSemana: fila.dia_semana,
        horaInicio: fila.hora_inicio,
        horaFin: fila.hora_fin,
        duracionMin: agenda.duracion_bloque_min,
        cuposPorBloque: fila.cupos_por_bloque,
        cupoDiario: fila.cupo_diario,
      }));
    const bloqueadas = new Set<string>([
      ...bloqueos.results.filter((fila) => fila.agenda_id === agenda.id).map((fila) => `${agenda.id}|${fila.fecha}`),
      ...(agenda.id === "PRIMERA_VEZ" ? ausencias.results.map((fila) => `PRIMERA_VEZ|${fila.fecha}`) : []),
    ]);
    const dias = generarDias({
      desde: hoy,
      hasta: sumarDias(hoy, agenda.ventana_dias),
      plantillas,
      feriados: festivos,
      bloqueos: bloqueadas,
      examenesPorHora: agenda.id === "PRIMERA_VEZ" ? Number(parametro?.valor ?? "1.5") : undefined,
    });
    for (const dia of dias) {
      piezas.push({ agendaId: dia.agendaId, fecha: dia.fecha, hora: null, capacidad: dia.cupoDiario, cupoDiario: dia.cupoDiario });
      for (const hora of dia.horas) {
        piezas.push({ agendaId: dia.agendaId, fecha: dia.fecha, hora, capacidad: dia.cuposPorBloque, cupoDiario: dia.cupoDiario });
      }
    }
  }
  const cursor = Math.max(0, Number(cursorFila?.valor ?? "0") || 0);
  const inicio = cursor >= piezas.length ? 0 : cursor;
  const corte = piezas.slice(inicio, inicio + POR_LOTE);
  if (corte.length === 0) {
    await guardarCursor(db, "0");
    return { escritos: 0, pendiente: false };
  }
  await db.batch(corte.map((pieza) => sentencia(db, pieza)));
  const siguiente = inicio + corte.length;
  const pendiente = siguiente < piezas.length;
  await guardarCursor(db, pendiente ? String(siguiente) : "0");
  return { escritos: corte.filter((pieza) => pieza.hora).length, pendiente };
}

export async function regenerarCupos(db: D1Database, ahora = new Date()): Promise<number> {
  const lote = await publicarCuposLote(db, ahora);
  return lote.escritos;
}

function sentencia(db: D1Database, pieza: Pieza): D1PreparedStatement {
  if (!pieza.hora) {
    return db.prepare(
      `INSERT INTO cupos_dia (agenda_id, fecha, capacidad, usados, sobrecupo_tope, sobrecupo_usados)
       VALUES (?, ?, ?, 0, 0, 0)
       ON CONFLICT(agenda_id, fecha) DO UPDATE SET capacidad = MAX(excluded.capacidad, cupos_dia.usados)`,
    ).bind(pieza.agendaId, pieza.fecha, pieza.cupoDiario);
  }
  return db.prepare(
    `INSERT INTO cupos_bloque (agenda_id, fecha, hora, capacidad, usados) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(agenda_id, fecha, hora) DO UPDATE SET capacidad = MAX(excluded.capacidad, cupos_bloque.usados)`,
  ).bind(pieza.agendaId, pieza.fecha, pieza.hora, pieza.capacidad);
}

async function guardarCursor(db: D1Database, valor: string): Promise<void> {
  await db.prepare(
    `INSERT INTO parametros (clave, valor, descripcion) VALUES ('cupos_cursor', ?, 'Indice del lote de cupos')
     ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`,
  ).bind(valor).run();
}
