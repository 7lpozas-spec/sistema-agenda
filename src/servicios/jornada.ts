import { bloquePosterior, partesEnZona } from "../domain/tiempo";
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

export async function proponerTrasCierre(db: D1Database, agenda: string, ahora: Date, citas: Afectada[]): Promise<Propuesta[]> {
  const huecos = await cuposDesdeAhora(db, agenda, ahora, { limite: 48 });
  return asignarHuecos(citas, huecos);
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
