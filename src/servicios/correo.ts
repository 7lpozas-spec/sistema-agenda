import { documentosRequeridos, type TipoTramite } from "../domain/catalogo";

export interface Mensaje {
  citaId: string | null;
  tipo: "CONFIRMACION" | "RECORDATORIO" | "REAGENDAMIENTO" | "CANCELACION";
  destinatario: string;
  asunto: string;
  html: string;
  texto: string;
}

export interface MailSender {
  enviar(mensaje: Mensaje): Promise<{ ok: boolean; id?: string; error?: string }>;
}

export function crearCorreo(env: Env): MailSender {
  if (env.MAIL_API_KEY && env.MAIL_API_URL) {
    return {
      async enviar(mensaje) {
        const respuesta = await fetch(env.MAIL_API_URL!, {
          method: "POST",
          headers: { authorization: `Bearer ${env.MAIL_API_KEY}`, "content-type": "application/json" },
          body: JSON.stringify({ to: mensaje.destinatario, subject: mensaje.asunto, html: mensaje.html, text: mensaje.texto }),
        });
        if (!respuesta.ok) return { ok: false, error: `HTTP ${respuesta.status}` };
        return { ok: true, id: respuesta.headers.get("x-message-id") ?? crypto.randomUUID() };
      },
    };
  }
  return { async enviar() { return { ok: false, error: "Correo no configurado: faltan MAIL_API_URL o MAIL_API_KEY. No se envió el mensaje." }; } };
}

export async function despachar(env: Env, mensaje: Mensaje): Promise<boolean> {
  const correo = crearCorreo(env);
  let estado = "ENVIADO";
  let error: string | null = null;
  let proveedor: string | null = null;
  try {
    const resultado = await correo.enviar(mensaje);
    proveedor = resultado.id ?? null;
    if (!resultado.ok) {
      estado = "ERROR";
      error = resultado.error ?? "error";
    }
  } catch (falla) {
    estado = "ERROR";
    error = falla instanceof Error ? falla.message : "error";
  }
  await env.DB.prepare(
    `INSERT INTO correos_log (id, cita_id, tipo, destinatario, estado, proveedor_id, error, intentos, at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
  )
    .bind(crypto.randomUUID(), mensaje.citaId, mensaje.tipo, mensaje.destinatario, estado, proveedor, error, new Date().toISOString())
    .run();
  return estado === "ENVIADO";
}

export async function armarCorreo(
  db: D1Database,
  tipo: Mensaje["tipo"],
  datos: Record<string, string>,
  citaId: string | null,
  destinatario: string,
): Promise<Mensaje | null> {
  const plantilla = await db.prepare("SELECT asunto, html, texto FROM plantillas_correo WHERE id = ?").bind(tipo).first<{
    asunto: string;
    html: string;
    texto: string;
  }>();
  if (!plantilla) return null;
  const reemplazar = (texto: string) => texto.replace(/\{\{(\w+)\}\}/g, (_, clave: string) => datos[clave] ?? "");
  return {
    citaId,
    tipo,
    destinatario,
    asunto: reemplazar(plantilla.asunto),
    html: reemplazar(plantilla.html),
    texto: reemplazar(plantilla.texto),
  };
}

export function textoDocumentos(tipo: Pick<TipoTramite, "requiere_carnet" | "requiere_licencia">): string {
  const docs = documentosRequeridos(tipo);
  if (docs.length === 0) return "cédula de identidad";
  const partes: string[] = [];
  if (tipo.requiere_carnet) partes.push("cédula de identidad");
  if (tipo.requiere_licencia) partes.push("licencia anterior");
  return partes.join(" y ");
}
