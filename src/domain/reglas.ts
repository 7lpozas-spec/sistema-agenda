import { FECHA_CORTE_PRIMERA_VEZ, esControl, type TipoTramite } from "./catalogo";

export interface Derivacion {
  codigo: "REDIRIGIR_PRIMERA_VEZ" | "TRAMITE_SIN_AGENDA";
  mensaje: string;
  tipoSugerido: string;
}

export function evaluarTipo(input: {
  tipo: TipoTramite;
  licenciaObtenidaEl?: string | null;
  nacionalidad?: string | null;
}): Derivacion | null {
  if (!input.tipo.requiere_agenda) {
    if (input.tipo.id === "CANJE_EXTRANJERA" && input.nacionalidad) {
      const permitidas = nacionalidades(input.tipo);
      const coincide = permitidas.some((item) => item.toLowerCase() === input.nacionalidad!.trim().toLowerCase());
      if (!coincide) {
        return {
          codigo: "REDIRIGIR_PRIMERA_VEZ",
          tipoSugerido: "PRIMER_OTORG_NO_PROF",
          mensaje: `El canje publicado aplica a ${permitidas.join(" y ") || "las nacionalidades configuradas"}. Otra nacionalidad se tramita como primer otorgamiento, con hora, en la Agenda General.`,
        };
      }
    }
    return {
      codigo: "TRAMITE_SIN_AGENDA",
      tipoSugerido: input.tipo.id,
      mensaje: `Este trámite (${input.tipo.nombre}) no requiere hora. El vecino puede acudir directamente en horario de atención.`,
    };
  }
  if (esControl(input.tipo.id) && input.licenciaObtenidaEl && input.licenciaObtenidaEl < FECHA_CORTE_PRIMERA_VEZ) {
    return {
      codigo: "REDIRIGIR_PRIMERA_VEZ",
      tipoSugerido: "PRIMER_OTORG_NO_PROF",
      mensaje: "Una licencia obtenida antes del 07-02-1984 se tramita como primer otorgamiento, en la Agenda General.",
    };
  }
  return null;
}

export function nacionalidades(tipo: TipoTramite): string[] {
  if (!tipo.nacionalidades_canje) return [];
  try {
    const valor = JSON.parse(tipo.nacionalidades_canje) as unknown;
    return Array.isArray(valor) ? valor.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function bloquesNecesarios(duracionSlot: number | null, duracionBloque: number): number {
  const duracion = duracionSlot && duracionSlot > 0 ? duracionSlot : duracionBloque;
  return Math.max(1, Math.ceil(duracion / duracionBloque));
}
