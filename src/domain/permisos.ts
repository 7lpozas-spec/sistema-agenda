import type { AgendaId, Rol } from "./catalogo";

export function puedeAdministrar(rol: Rol): boolean {
  return rol === "ADMIN";
}

/** Un operador agenda en las dos agendas. El instructor y el mesón no reservan. */
export function puedeCrearCita(rol: Rol, _agenda: AgendaId): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA";
}

export function puedeVerAgenda(rol: Rol, agenda: AgendaId): boolean {
  if (rol === "ADMIN" || rol === "OPERADOR_AGENDA") return true;
  return rol === "INSTRUCTOR" && agenda === "PRIMERA_VEZ";
}

export function agendasDeCitas(rol: Rol): AgendaId[] {
  if (rol === "INSTRUCTOR") return ["PRIMERA_VEZ"];
  return ["GENERAL", "PRIMERA_VEZ"];
}

export function puedeVerCupos(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA" || rol === "INSTRUCTOR";
}

export function puedeVerDashboard(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA" || rol === "INSTRUCTOR" || rol === "RECEPCION";
}

export function puedeConfirmarAsistencia(rol: Rol, agenda: AgendaId): boolean {
  if (rol === "ADMIN" || rol === "OPERADOR_AGENDA" || rol === "RECEPCION") return true;
  return rol === "INSTRUCTOR" && agenda === "PRIMERA_VEZ";
}

export function puedeMarcarResultado(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "INSTRUCTOR";
}

export function puedeExportar(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA" || rol === "INSTRUCTOR";
}

export function puedeBloquear(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA";
}

export function puedeFotografiar(rol: Rol, agenda: AgendaId): boolean {
  if (rol === "ADMIN" || rol === "OPERADOR_AGENDA") return true;
  return rol === "INSTRUCTOR" && agenda === "PRIMERA_VEZ";
}

export function vistaDe(rol: Rol): "admin" | "operador" | "instructor" | "recepcion" {
  if (rol === "ADMIN") return "admin";
  if (rol === "INSTRUCTOR") return "instructor";
  if (rol === "RECEPCION") return "recepcion";
  return "operador";
}
