export function cambios(resultado: { meta?: { changes?: number } }): number {
  return resultado.meta?.changes ?? 0;
}

/** Sentencia que toma un cupo solo si todavía hay capacidad. Es la barrera contra la sobre-reserva. */
export const SQL_TOMAR_BLOQUE = `
UPDATE cupos_bloque
SET usados = usados + 1
WHERE agenda_id = ? AND fecha = ? AND hora = ? AND usados < capacidad
`;
