import { esPrimerOtorgamiento } from "./catalogo";

export const MENSAJE_EXAMEN = {
  NO_HABILITADO: "No está habilitado para el examen práctico.",
  YA_APROBADO: "Ya aprobó el examen práctico.",
  EXAMEN_ACTIVO: "Ya tiene un examen práctico agendado.",
} as const;

export type CodigoExamen = keyof typeof MENSAJE_EXAMEN;

export const NOMBRE_RESULTADO: Record<string, string> = {
  APROBADO: "Aprobado",
  REPROBADO: "Reprobado",
  NO_ASISTIO: "No asistió",
};

export function etiquetaIntento(intento: { estado: string; resultado?: string | null }): string {
  const resultado = resultadoDeIntento(intento);
  if (resultado) return NOMBRE_RESULTADO[resultado];
  if (intento.estado === "AGENDADA") return "Agendada";
  if (intento.estado === "CANCELADA") return "Cancelada";
  return intento.estado;
}

export interface CitaOtorgamiento {
  agenda_id: string;
  tipo_tramite_id: string;
  estado: string;
  atencion_at?: string | null;
}

export interface CitaExamen {
  id: string;
  fecha: string;
  hora: string;
  estado: string;
  resultado?: string | null;
}

export interface EvaluacionExamen {
  habilitado: boolean;
  codigo?: CodigoExamen;
  mensaje?: string;
  examenActivo?: Pick<CitaExamen, "id" | "fecha" | "hora">;
}

export function esExamenPractico(cita: { agenda_id?: string | null; tipo_tramite_id?: string | null }): boolean {
  return cita.agenda_id === "PRIMERA_VEZ" || cita.tipo_tramite_id === "EXAMEN_PRACTICO";
}

export function otorgamientoAtendido(cita: CitaOtorgamiento): boolean {
  if (cita.agenda_id !== "GENERAL" || !esPrimerOtorgamiento(cita.tipo_tramite_id)) return false;
  if (cita.estado === "CANCELADA" || cita.estado === "ANULADA") return false;
  return Boolean(cita.atencion_at);
}

export function resultadoDeIntento(intento: { estado: string; resultado?: string | null }): "APROBADO" | "REPROBADO" | "NO_ASISTIO" | null {
  if (intento.resultado === "APROBADO" || intento.resultado === "REPROBADO") return intento.resultado;
  if (intento.resultado === "NO_ASISTIO" || intento.estado === "NO_ASISTIO") return "NO_ASISTIO";
  return null;
}

export function evaluarHabilitacionExamen(input: {
  otorgamientos: CitaOtorgamiento[];
  examenes: CitaExamen[];
}): EvaluacionExamen {
  const atendido = input.otorgamientos.some(otorgamientoAtendido);
  if (!atendido) return { habilitado: false, codigo: "NO_HABILITADO", mensaje: MENSAJE_EXAMEN.NO_HABILITADO };
  const vigentes = input.examenes.filter((cita) => cita.estado !== "CANCELADA" && cita.estado !== "ANULADA");
  if (vigentes.some((cita) => cita.resultado === "APROBADO")) {
    return { habilitado: false, codigo: "YA_APROBADO", mensaje: MENSAJE_EXAMEN.YA_APROBADO };
  }
  const activo = vigentes.find((cita) => cita.estado === "AGENDADA");
  if (activo) {
    return {
      habilitado: false,
      codigo: "EXAMEN_ACTIVO",
      mensaje: MENSAJE_EXAMEN.EXAMEN_ACTIVO,
      examenActivo: { id: activo.id, fecha: activo.fecha, hora: activo.hora },
    };
  }
  return { habilitado: true };
}
