import type { AgendaId, Rol } from "./catalogo";

export function puedeAdministrar(rol: Rol): boolean {
  return rol === "ADMIN";
}

/** Un operador agenda en las dos agendas. El instructor no reserva. */
export function puedeCrearCita(rol: Rol, _agenda: AgendaId): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA";
}

export function puedeVerAgenda(rol: Rol, agenda: AgendaId): boolean {
  if (rol === "ADMIN" || rol === "OPERADOR_AGENDA") return true;
  return rol === "INSTRUCTOR" && agenda === "PRIMERA_VEZ";
}

export function puedeVerDashboard(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA";
}

export function puedeConfirmarAsistencia(rol: Rol, agenda: AgendaId): boolean {
  if (rol === "ADMIN" || rol === "OPERADOR_AGENDA") return true;
  return rol === "INSTRUCTOR" && agenda === "PRIMERA_VEZ";
}

export function puedeMarcarResultado(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "INSTRUCTOR";
}

export function puedeExportar(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA";
}

export function puedeBloquear(rol: Rol): boolean {
  return rol === "ADMIN" || rol === "OPERADOR_AGENDA";
}

export function puedeFotografiar(rol: Rol, agenda: AgendaId): boolean {
  if (rol === "ADMIN" || rol === "OPERADOR_AGENDA") return true;
  return rol === "INSTRUCTOR" && agenda === "PRIMERA_VEZ";
}
