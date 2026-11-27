import { useEffect } from "react";

export interface EventoVivo {
  tipo: string;
  citaId?: string;
  agendaId?: string;
  documentoId?: string;
  at: string;
}

export function ConexionViva({ activo }: { activo: boolean }) {
  useEffect(() => {
    if (!activo) return;
    let socket: WebSocket | null = null;
    let cerrado = false;
    let espera = 0;
    let temporizador: number | undefined;
    function abrir() {
      if (cerrado) return;
      const protocolo = location.protocol === "https:" ? "wss" : "ws";
      socket = new WebSocket(`${protocolo}://${location.host}/api/vivo`);
      socket.onmessage = (mensaje) => {
        try {
          const detalle = JSON.parse(String(mensaje.data)) as EventoVivo;
          window.dispatchEvent(
            new CustomEvent("licencia", { detail: detalle }),
          );
        } catch {
          /* mensaje ajeno */
        }
      };
      socket.onopen = () => {
        espera = 0;
        window.dispatchEvent(
          new CustomEvent("licencia", {
            detail: { tipo: "sincronizar", at: new Date().toISOString() },
          }),
        );
      };
      socket.onclose = () => {
        if (cerrado) return;
        espera = Math.min(8000, espera === 0 ? 800 : espera * 2);
        temporizador = window.setTimeout(abrir, espera);
      };
    }
    abrir();
    return () => {
      cerrado = true;
      window.clearTimeout(temporizador);
      socket?.close();
    };
  }, [activo]);
  return null;
}

export function useVivo(alRecibir: (evento: EventoVivo) => void) {
  useEffect(() => {
    const oir = (evento: Event) =>
      alRecibir((evento as CustomEvent<EventoVivo>).detail);
    window.addEventListener("licencia", oir);
    return () => window.removeEventListener("licencia", oir);
  }, [alRecibir]);
}
