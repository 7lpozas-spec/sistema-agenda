import { useEffect, useState } from "react";

export interface AyudaAtajo {
  tecla: string;
  accion: string;
}

export function useAtajos(acciones: Record<string, () => void>, ayuda: AyudaAtajo[]) {
  const [abierta, setAbierta] = useState(false);
  useEffect(() => {
    function tecla(evento: KeyboardEvent) {
      const destino = evento.target as HTMLElement | null;
      const escribe = destino && (destino.tagName === "INPUT" || destino.tagName === "TEXTAREA" || destino.tagName === "SELECT" || destino.isContentEditable);
      if (evento.key === "Escape") {
        setAbierta(false);
        return;
      }
      if (evento.key === "?" && !escribe) {
        evento.preventDefault();
        setAbierta((valor) => !valor);
        return;
      }
      if (escribe || evento.metaKey || evento.ctrlKey || evento.altKey) return;
      const accion = acciones[evento.key];
      if (!accion) return;
      evento.preventDefault();
      accion();
    }
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [acciones]);
  return { abierta, cerrar: () => setAbierta(false), ayuda };
}

export function Ayuda({ abierta, ayuda, onCerrar }: { abierta: boolean; ayuda: AyudaAtajo[]; onCerrar: () => void }) {
  if (!abierta) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#141b2b]/45 px-4" onClick={onCerrar}>
      <section className="superficie grid w-full max-w-sm gap-2 p-4" onClick={(evento) => evento.stopPropagation()}>
        <h2 className="text-lg font-semibold">Atajos</h2>
        <ul className="grid gap-1 text-sm">
          {ayuda.map((fila) => (
            <li key={fila.tecla} className="flex justify-between gap-3">
              <span>{fila.accion}</span>
              <kbd className="rounded border border-line px-1.5 font-mono text-xs">{fila.tecla}</kbd>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
