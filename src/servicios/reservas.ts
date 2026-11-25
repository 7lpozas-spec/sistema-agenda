import { bloquesNecesarios } from "../domain/reglas";
import { horaDeMinutos, minutosDeHora } from "../domain/tiempo";
import { cambios } from "../data/sql";

export type ResultadoCupo = { ok: true } | { ok: false; codigo: "SIN_CUPO" | "SIN_BLOQUE" };

async function mover(db: D1Database, sql: string, valores: (string | number)[]): Promise<boolean> {
  const resultado = await db.prepare(sql).bind(...valores).run();
  return cambios(resultado) === 1;
}

export async function tomarCupos(
  db: D1Database,
  input: { agendaId: string; fecha: string; hora: string; cantidad: number; bloques: number; duracionBloque: number; sobrecupo: boolean },
): Promise<ResultadoCupo> {
  const horas = horasConsecutivas(input.hora, input.bloques, input.duracionBloque);
  for (const hora of horas) {
    const ok = await mover(
      db,
      `UPDATE cupos_bloque SET usados = usados + ? WHERE agenda_id = ? AND fecha = ? AND hora = ? AND usados + ? <= capacidad`,
      [input.cantidad, input.agendaId, input.fecha, hora, input.cantidad],
    );
    if (!ok) {
      for (const previa of horas) {
        if (previa === hora) break;
        await mover(
          db,
          `UPDATE cupos_bloque SET usados = usados - ? WHERE agenda_id = ? AND fecha = ? AND hora = ? AND usados >= ?`,
          [input.cantidad, input.agendaId, input.fecha, previa, input.cantidad],
        );
      }
      return { ok: false, codigo: "SIN_BLOQUE" };
    }
  }
  const dia = input.sobrecupo
    ? `UPDATE cupos_dia SET sobrecupo_usados = sobrecupo_usados + ? WHERE agenda_id = ? AND fecha = ? AND sobrecupo_usados + ? <= sobrecupo_tope`
    : `UPDATE cupos_dia SET usados = usados + ? WHERE agenda_id = ? AND fecha = ? AND usados + ? <= capacidad`;
  const okDia = await mover(db, dia, [input.cantidad, input.agendaId, input.fecha, input.cantidad]);
  if (!okDia) {
    await liberarBloques(db, input.agendaId, input.fecha, horas, input.cantidad);
    return { ok: false, codigo: "SIN_CUPO" };
  }
  return { ok: true };
}

export async function liberarCupos(
  db: D1Database,
  input: { agendaId: string; fecha: string; hora: string; cantidad: number; bloques: number; duracionBloque: number; sobrecupo: boolean },
): Promise<void> {
  const horas = horasConsecutivas(input.hora, input.bloques, input.duracionBloque);
  await liberarBloques(db, input.agendaId, input.fecha, horas, input.cantidad);
  const sql = input.sobrecupo
    ? `UPDATE cupos_dia SET sobrecupo_usados = sobrecupo_usados - ? WHERE agenda_id = ? AND fecha = ? AND sobrecupo_usados >= ?`
    : `UPDATE cupos_dia SET usados = usados - ? WHERE agenda_id = ? AND fecha = ? AND usados >= ?`;
  await mover(db, sql, [input.cantidad, input.agendaId, input.fecha, input.cantidad]);
}

async function liberarBloques(db: D1Database, agenda: string, fecha: string, horas: string[], cantidad: number) {
  for (const hora of horas) {
    await mover(
      db,
      `UPDATE cupos_bloque SET usados = usados - ? WHERE agenda_id = ? AND fecha = ? AND hora = ? AND usados >= ?`,
      [cantidad, agenda, fecha, hora, cantidad],
    );
  }
}

export function horasConsecutivas(hora: string, bloques: number, duracionMin: number): string[] {
  const lista = [hora];
  if (bloques <= 1 || duracionMin <= 0) return lista;
  let cursor = minutosDeHora(hora);
  for (let i = 1; i < bloques; i += 1) {
    cursor += duracionMin;
    lista.push(horaDeMinutos(cursor));
  }
  return lista;
}

export function bloquesDeTipo(duracionSlot: number | null, duracionBloque: number): number {
  return bloquesNecesarios(duracionSlot, duracionBloque);
}
