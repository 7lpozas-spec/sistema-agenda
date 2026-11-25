import { DurableObject } from "cloudflare:workers";
import { liberarCupos, tomarCupos } from "./servicios/reservas";

/**
 * Un objeto por agenda. Serializa crear, reagendar y cancelar para que dos
 * clics al mismo tiempo no puedan tomar el mismo cupo (sección 7.3).
 */
export class AgendaLock extends DurableObject<Env> {
  private cola: Promise<unknown> = Promise.resolve();

  private encolar<T>(tarea: () => Promise<T>): Promise<T> {
    const resultado = this.cola.then(tarea, tarea);
    this.cola = resultado.then(
      () => undefined,
      () => undefined,
    );
    return resultado;
  }

  tomar(input: {
    agendaId: string;
    fecha: string;
    hora: string;
    cantidad: number;
    bloques: number;
    duracionBloque: number;
    sobrecupo: boolean;
  }): Promise<{ ok: true } | { ok: false; codigo: "SIN_CUPO" | "SIN_BLOQUE" }> {
    return this.encolar(() => tomarCupos(this.env.DB, input));
  }

  liberar(input: {
    agendaId: string;
    fecha: string;
    hora: string;
    cantidad: number;
    bloques: number;
    duracionBloque: number;
    sobrecupo: boolean;
  }): Promise<void> {
    return this.encolar(() => liberarCupos(this.env.DB, input));
  }
}

/** Canal único de la oficina. Las pantallas abiertas reciben cada cambio al instante. */
export class CaptureSession extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response(null, { status: 426 });
    }
    const par = new WebSocketPair();
    this.ctx.acceptWebSocket(par[1]);
    return new Response(null, { status: 101, webSocket: par[0] });
  }

  async emitir(evento: Record<string, unknown>): Promise<void> {
    const data = JSON.stringify(evento);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(data);
      } catch {
        /* el navegador ya cerró */
      }
    }
  }
}

export function sala(env: Env): DurableObjectStub<CaptureSession> {
  return env.CAPTURE_SESSION.get(env.CAPTURE_SESSION.idFromName("oficina"));
}

export function candado(env: Env, agendaId: string): DurableObjectStub<AgendaLock> {
  return env.AGENDA_LOCK.get(env.AGENDA_LOCK.idFromName(agendaId));
}
