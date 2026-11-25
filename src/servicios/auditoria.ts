export async function auditar(
  db: D1Database,
  input: {
    usuarioId: string | null;
    accion: string;
    entidad: string;
    entidadId?: string | null;
    antes?: unknown;
    despues?: unknown;
    ip?: string;
    userAgent?: string;
  },
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO auditoria (id, usuario_id, accion, entidad, entidad_id, antes, despues, ip, user_agent, at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.usuarioId,
      input.accion,
      input.entidad,
      input.entidadId ?? null,
      input.antes === undefined ? null : JSON.stringify(input.antes),
      input.despues === undefined ? null : JSON.stringify(input.despues),
      input.ip ?? null,
      input.userAgent ?? null,
      new Date().toISOString(),
    )
    .run();
}

export function enmascararEnLog(texto: string): string {
  return texto.replace(/\b\d{7,8}-[\dkK]\b/g, (rut) => {
    const [cuerpo, dv] = rut.split("-");
    return `${cuerpo.slice(0, 2)}*****${cuerpo.slice(-1)}-${dv}`;
  });
}
