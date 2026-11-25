import { diaIsoDeFecha, horaDeMinutos, minutosDeHora, sumarDias } from "./tiempo";
import type { AgendaId } from "./catalogo";

export interface PlantillaDia {
  agendaId: AgendaId;
  diaSemana: number;
  horaInicio: string;
  horaFin: string;
  duracionMin: number;
  cuposPorBloque: number;
  cupoDiario: number;
}

export interface CupoGenerado {
  agendaId: AgendaId;
  fecha: string;
  horas: string[];
  cuposPorBloque: number;
  cupoDiario: number;
}

export function horasDeBloque(inicio: string, fin: string, duracionMin: number): string[] {
  const desde = minutosDeHora(inicio);
  const hasta = minutosDeHora(fin);
  const horas: string[] = [];
  if (duracionMin < 5 || hasta <= desde) return horas;
  for (let cursor = desde; cursor + duracionMin <= hasta; cursor += duracionMin) {
    horas.push(horaDeMinutos(cursor));
  }
  return horas;
}

export function capacidadExaminador(horaInicio: string, horaFin: string, examenesPorHora: number): number {
  const horas = (minutosDeHora(horaFin) - minutosDeHora(horaInicio)) / 60;
  if (horas <= 0 || examenesPorHora <= 0) return 0;
  return Math.max(0, Math.round(horas * examenesPorHora));
}

export function generarDias(input: {
  desde: string;
  hasta: string;
  plantillas: readonly PlantillaDia[];
  feriados: ReadonlySet<string>;
  bloqueos: ReadonlySet<string>;
  examenesPorHora?: number;
}): CupoGenerado[] {
  const salida: CupoGenerado[] = [];
  let fecha = input.desde;
  while (fecha <= input.hasta) {
    const dia = diaIsoDeFecha(fecha);
    for (const plantilla of input.plantillas) {
      if (plantilla.diaSemana !== dia) continue;
      const clave = `${plantilla.agendaId}|${fecha}`;
      if (input.feriados.has(fecha) || input.bloqueos.has(clave)) continue;
      const horas = horasDeBloque(plantilla.horaInicio, plantilla.horaFin, plantilla.duracionMin);
      if (horas.length === 0) continue;
      let cupoDiario = Math.min(plantilla.cupoDiario, horas.length * plantilla.cuposPorBloque);
      if (plantilla.agendaId === "PRIMERA_VEZ" && input.examenesPorHora) {
        cupoDiario = Math.min(cupoDiario, capacidadExaminador(plantilla.horaInicio, plantilla.horaFin, input.examenesPorHora));
      }
      salida.push({
        agendaId: plantilla.agendaId,
        fecha,
        horas,
        cuposPorBloque: plantilla.cuposPorBloque,
        cupoDiario,
      });
    }
    fecha = sumarDias(fecha, 1);
  }
  return salida;
}
