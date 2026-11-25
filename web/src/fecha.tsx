import { useEffect, useId, useRef, useState } from "react";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const NOMBRES = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CORTOS = ["", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá", "Do"];

export function diaSemanaIso(iso: string): number {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return js === 0 ? 7 : js;
}

export function grillaLaborable(mes: string, laborables: number[]): { etiquetas: string[]; cortas: string[]; celdas: (string | null)[] } {
  const dias = (laborables.length > 0 ? laborables : [1, 2, 3, 4, 5, 6]).filter((dia) => dia >= 1 && dia <= 7).sort((a, b) => a - b);
  const [anio, numero] = mes.split("-").map(Number);
  const total = new Date(Date.UTC(anio, numero, 0)).getUTCDate();
  const celdas: (string | null)[] = [];
  let previa = -1;
  for (let dia = 1; dia <= total; dia += 1) {
    const fecha = `${mes}-${String(dia).padStart(2, "0")}`;
    const columna = dias.indexOf(diaSemanaIso(fecha));
    if (columna < 0) continue;
    if (celdas.length === 0) {
      for (let i = 0; i < columna; i += 1) celdas.push(null);
    } else if (columna <= previa) {
      for (let i = previa + 1; i < dias.length; i += 1) celdas.push(null);
      for (let i = 0; i < columna; i += 1) celdas.push(null);
    }
    celdas.push(fecha);
    previa = columna;
  }
  if (previa >= 0) {
    for (let i = previa + 1; i < dias.length; i += 1) celdas.push(null);
  }
  return { etiquetas: dias.map((dia) => NOMBRES[dia] ?? ""), cortas: dias.map((dia) => CORTOS[dia] ?? ""), celdas };
}

export function textoFecha(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [anio, mes, dia] = iso.split("-");
  return `${dia}-${mes}-${anio}`;
}

function aIso(texto: string): string | null {
  const limpio = texto.trim();
  const chileno = /^(\d{2})-(\d{2})-(\d{4})$/.exec(limpio);
  if (chileno) return `${chileno[3]}-${chileno[2]}-${chileno[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio;
  return null;
}

export function Fecha({
  id,
  valor,
  alCambiar,
  etiqueta,
  laborables = [1, 2, 3, 4, 5, 6],
}: {
  id: string;
  valor: string;
  alCambiar: (iso: string) => void;
  etiqueta: string;
  laborables?: number[];
}) {
  const reactId = useId();
  const caja = useRef<HTMLDivElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState(() => textoFecha(valor));
  const [mes, setMes] = useState(() => valor.slice(0, 7) || new Date().toISOString().slice(0, 7));

  useEffect(() => {
    setTexto(textoFecha(valor));
    if (valor) setMes(valor.slice(0, 7));
  }, [valor]);

  useEffect(() => {
    if (!abierto) return;
    function cerrar(evento: MouseEvent) {
      if (!caja.current?.contains(evento.target as Node)) setAbierto(false);
    }
    function tecla(evento: KeyboardEvent) {
      if (evento.key === "Escape") setAbierto(false);
    }
    window.addEventListener("mousedown", cerrar);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("mousedown", cerrar);
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  const grilla = grillaLaborable(mes, laborables);
  const [anio, numero] = mes.split("-").map(Number);

  function mover(delta: number) {
    const fecha = new Date(Date.UTC(anio, numero - 1 + delta, 1));
    setMes(fecha.toISOString().slice(0, 7));
  }

  return (
    <div ref={caja} className="relative">
      <div className="grid gap-1 text-xs font-medium text-muted">
        <label htmlFor={id}>{etiqueta}</label>
        <span className="flex h-10 overflow-hidden rounded-lg border border-line bg-white">
          <input
            id={id}
            inputMode="numeric"
            placeholder="dd-mm-aaaa"
            className="min-w-[8.5rem] flex-1 bg-transparent px-3 text-sm font-normal text-ink outline-none"
            value={texto}
            onChange={(evento) => {
              setTexto(evento.target.value);
              const iso = aIso(evento.target.value);
              if (iso) alCambiar(iso);
            }}
            onBlur={() => setTexto(textoFecha(valor))}
          />
          <button type="button" className="px-2 font-normal text-muted" aria-label="Abrir calendario" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)}>▾</button>
        </span>
      </div>
      {abierto ? (
        <div role="dialog" aria-label={etiqueta} id={`${reactId}-cal`} className="absolute z-30 mt-1 w-[17.5rem] rounded-xl border border-line bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="h-8 w-8 rounded-lg hover:bg-paper" aria-label="Mes anterior" onClick={() => mover(-1)}>‹</button>
            <p className="text-sm font-semibold capitalize">{MESES[numero - 1]} {anio}</p>
            <button type="button" className="h-8 w-8 rounded-lg hover:bg-paper" aria-label="Mes siguiente" onClick={() => mover(1)}>›</button>
          </div>
          <div className="grid gap-1 text-center text-[11px] font-medium uppercase text-muted" style={{ gridTemplateColumns: `repeat(${grilla.cortas.length}, minmax(0, 1fr))` }}>
            {grilla.cortas.map((dia) => <span key={dia}>{dia}</span>)}
          </div>
          <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${grilla.cortas.length}, minmax(0, 1fr))` }}>
            {grilla.celdas.map((iso, indice) => {
              if (!iso) return <span key={`v-${indice}`} />;
              const activo = iso === valor;
              return (
                <button
                  key={iso}
                  type="button"
                  className={`h-8 rounded-lg text-sm ${activo ? "bg-[#1e283c] text-white" : "hover:bg-paper"}`}
                  onClick={() => {
                    alCambiar(iso);
                    setAbierto(false);
                  }}
                >
                  {Number(iso.slice(8))}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
