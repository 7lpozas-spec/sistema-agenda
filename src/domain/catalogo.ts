export const ROLES = ["ADMIN", "OPERADOR_AGENDA", "INSTRUCTOR", "RECEPCION"] as const;
export type Rol = (typeof ROLES)[number];

export const AGENDAS = ["GENERAL", "PRIMERA_VEZ"] as const;
export type AgendaId = (typeof AGENDAS)[number];

export const ESTADOS = ["AGENDADA", "CANCELADA", "ANULADA", "ASISTIO", "ATRASADO", "NO_ASISTIO"] as const;
export type EstadoCita = (typeof ESTADOS)[number];

export const TIPOS_DOCUMENTO = ["CARNET_FRENTE", "CARNET_REVERSO", "LICENCIA_FRENTE", "LICENCIA_REVERSO"] as const;
export type TipoDocumento = (typeof TIPOS_DOCUMENTO)[number];

export interface TipoTramite {
  id: string;
  nombre: string;
  requiere_agenda: number;
  agenda_id: AgendaId | null;
  duracion_slot_min: number | null;
  cupos_que_consume: number;
  examen_teorico: number;
  examen_practico: number;
  requiere_carnet: number;
  requiere_licencia: number;
  mapeo_confirmado: number;
  nacionalidades_canje: string | null;
  activo: number;
  orden: number;
}

export function esRol(valor: string): valor is Rol {
  return (ROLES as readonly string[]).includes(valor);
}

export function esAgenda(valor: string): valor is AgendaId {
  return (AGENDAS as readonly string[]).includes(valor);
}

/** Entrada común: una cita (agenda real + tipo) o el tipo al crear la reserva. */
export interface EntradaDocumentos {
  agenda_id?: string | null;
  tipo_tramite_id?: string | null;
  requiere_carnet?: number;
  requiere_licencia?: number;
  tipo?: Pick<TipoTramite, "id" | "requiere_carnet" | "requiere_licencia"> | null;
}

export function documentosRequeridos(cita: EntradaDocumentos): TipoDocumento[] {
  if (cita.agenda_id === "PRIMERA_VEZ") return [];
  const tipoId = cita.tipo?.id ?? cita.tipo_tramite_id ?? "";
  if (tipoId && esPrimerOtorgamiento(tipoId)) return ["CARNET_FRENTE", "CARNET_REVERSO"];
  const carnet = cita.tipo?.requiere_carnet ?? cita.requiere_carnet;
  const licencia = cita.tipo?.requiere_licencia ?? cita.requiere_licencia;
  const lista: TipoDocumento[] = [];
  if (carnet) lista.push("CARNET_FRENTE", "CARNET_REVERSO");
  if (licencia) lista.push("LICENCIA_FRENTE", "LICENCIA_REVERSO");
  return lista;
}

export function cantidadDocumentosRequeridos(cita: EntradaDocumentos): number {
  return documentosRequeridos(cita).length;
}

export function documentosAPresentar(cita: EntradaDocumentos): string[] {
  const docs = documentosRequeridos(cita);
  const lista: string[] = [];
  if (docs.some((doc) => doc.startsWith("CARNET_"))) lista.push("Cédula de identidad vigente");
  if (docs.some((doc) => doc.startsWith("LICENCIA_"))) lista.push("Licencia de conducir anterior");
  return lista;
}

export function esControl(id: string): boolean {
  return id.startsWith("CONTROL_RENOVACION");
}

export function esPrimerOtorgamiento(id: string): boolean {
  return id.startsWith("PRIMER_OTORG_");
}

export const NOMBRE_ROL: Record<Rol, string> = {
  ADMIN: "Administración",
  OPERADOR_AGENDA: "Operador de agenda",
  INSTRUCTOR: "Instructor",
  RECEPCION: "Recepción",
};

export const FECHA_CORTE_PRIMERA_VEZ = "1984-02-07";
