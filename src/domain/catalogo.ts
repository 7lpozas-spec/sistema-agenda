export const ROLES = ["ADMIN", "OPERADOR_AGENDA", "INSTRUCTOR"] as const;
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

export function documentosRequeridos(tipo: Pick<TipoTramite, "requiere_carnet" | "requiere_licencia">): TipoDocumento[] {
  const lista: TipoDocumento[] = [];
  if (tipo.requiere_carnet) lista.push("CARNET_FRENTE", "CARNET_REVERSO");
  if (tipo.requiere_licencia) lista.push("LICENCIA_FRENTE", "LICENCIA_REVERSO");
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
};

export const FECHA_CORTE_PRIMERA_VEZ = "1984-02-07";
