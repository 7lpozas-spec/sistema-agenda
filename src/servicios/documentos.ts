import { documentosRequeridos, type TipoDocumento, type TipoTramite } from "../domain/catalogo";

export const NOMBRE_DOCUMENTO: Record<string, string> = {
  CARNET_FRENTE: "Carnet, frente",
  CARNET_REVERSO: "Carnet, reverso",
  LICENCIA_FRENTE: "Licencia, frente",
  LICENCIA_REVERSO: "Licencia, reverso",
  FOTO_CIUDADANO: "Foto persona",
  CEDULA: "Cédula",
  DOCUMENTO: "Documento",
};

export interface EstadoDocumentos {
  requeridos: TipoDocumento[];
  listos: TipoDocumento[];
  faltantes: TipoDocumento[];
}

export function resumirDocumentos(tipo: Pick<TipoTramite, "requiere_carnet" | "requiere_licencia"> | null, vigentes: string[]): EstadoDocumentos {
  const requeridos = tipo ? documentosRequeridos(tipo) : [];
  const hay = new Set(vigentes);
  return {
    requeridos,
    listos: requeridos.filter((doc) => hay.has(doc)),
    faltantes: requeridos.filter((doc) => !hay.has(doc)),
  };
}

export async function estadoDocumentos(db: D1Database, citaId: string, tipo: Pick<TipoTramite, "requiere_carnet" | "requiere_licencia"> | null): Promise<EstadoDocumentos> {
  const filas = await db.prepare("SELECT DISTINCT tipo FROM documentos WHERE cita_id = ? AND vigente = 1").bind(citaId).all<{ tipo: string }>();
  return resumirDocumentos(tipo, filas.results.map((fila) => fila.tipo));
}

/**
 * El comprobante se emite cuando la cita tiene todos sus documentos.
 * Una cita cancelada o anulada sí lo emite, porque el PDF sirve de constancia de ese estado.
 * El sobrecupo sigue la misma regla que una cita normal.
 */
export function comprobanteDisponible(estado: string, faltantes: readonly string[]): boolean {
  if (estado === "CANCELADA" || estado === "ANULADA") return true;
  return faltantes.length === 0;
}

/** D1 remoto entrega los BLOB como arreglo de números; el local, como ArrayBuffer. */
export function bytesDeBlob(valor: unknown): ArrayBuffer | null {
  if (valor == null) return null;
  if (valor instanceof ArrayBuffer) return valor.byteLength > 0 ? valor : null;
  if (ArrayBuffer.isView(valor)) {
    if (valor.byteLength === 0) return null;
    return new Uint8Array(valor.buffer, valor.byteOffset, valor.byteLength).slice().buffer;
  }
  if (Array.isArray(valor)) return valor.length > 0 ? Uint8Array.from(valor as number[]).buffer : null;
  return null;
}
