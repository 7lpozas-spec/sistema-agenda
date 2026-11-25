import { useEffect, useMemo, useState, type ReactNode } from "react";

export function Marca({ compacta = false }: { compacta?: boolean }) {
  return (
    <img
      src="/logo-recoleta-blanco.png"
      alt="Municipalidad de Recoleta. Somos todos."
      width={1003}
      height={380}
      fetchPriority="high"
      className={compacta ? "h-9 w-auto" : "h-12 w-auto"}
    />
  );
}

export function Aviso({ tono = "error", children }: { tono?: "error" | "ok" | "info"; children: ReactNode }) {
  const clases =
    tono === "ok"
      ? "border-pine bg-emerald-50 text-pine-dark"
      : tono === "info"
        ? "border-sky bg-sky-50 text-sky"
        : "border-alert bg-red-50 text-alert";
  return (
    <p role="alert" className={`border px-3 py-2 text-sm ${clases}`}>
      {children}
    </p>
  );
}

export function Campo({ id, etiqueta, ayuda, children }: { id: string; etiqueta: ReactNode; ayuda?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-sm font-semibold">
        {etiqueta}
      </label>
      {children}
      {ayuda ? (
        <p id={`${id}-ayuda`} className="text-sm text-muted">
          {ayuda}
        </p>
      ) : null}
    </div>
  );
}

export const claseCampo =
  "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink transition-colors outline-none hover:border-[#b8c8dd] focus:border-sky disabled:bg-paper disabled:text-muted";

export function Boton({
  children,
  tipo = "submit",
  variante = "primario",
  onClick,
}: {
  children: ReactNode;
  tipo?: "submit" | "button";
  variante?: "primario" | "secundario" | "peligro";
  onClick?: () => void;
}) {
  const clases =
    variante === "peligro"
      ? "bg-alert text-white hover:bg-[#9b1d14]"
      : variante === "secundario"
        ? "border border-line bg-white text-ink hover:bg-paper"
        : "bg-pine text-white hover:bg-pine-dark";
  return (
    <button type={tipo} onClick={onClick} className={`btn ${clases}`}>
      {children}
    </button>
  );
}

export function Estado({ valor }: { valor: string }) {
  const texto: Record<string, string> = {
    reservada: "Reservada",
    confirmada: "Llegó",
    en_atencion: "En atención",
    atendida: "Atendida",
    cancelada: "Cancelada",
    inasistencia: "Inasistencia",
    reagendada: "Reagendada",
    en_espera: "En espera",
    anulada: "Anulada",
    abierto: "Abierto",
    bloqueado: "Bloqueado",
    AGENDADA: "Agendada",
    ASISTIO: "Asistió",
    ATRASADO: "Atrasado",
    NO_ASISTIO: "No asistió",
    CANCELADA: "Cancelada",
    ANULADA: "Anulada",
  };
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold ${tonoEstado(valor)}`}>
      {texto[valor] ?? valor}
    </span>
  );
}

export function tonoEstado(valor: string): string {
  if (valor === "ASISTIO") return "bg-[#e5f6ec] text-[#146c43]";
  if (valor === "NO_ASISTIO") return "bg-[#eef1f5] text-[#586a80]";
  if (valor === "ATRASADO") return "bg-[#fff1dc] text-[#9a5b00]";
  if (valor === "CANCELADA" || valor === "ANULADA") return "bg-[#f8e8e6] text-alert";
  return "bg-[#e7eefc] text-[#1e3a8a]";
}

export function Cargando({ texto }: { texto: string }) {
  return <p className="text-muted">{texto}</p>;
}

export function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-lg border border-dashed border-line bg-card px-4 py-6 text-muted">{texto}</p>;
}

export function Esqueleto() {
  return (
    <div className="grid gap-3" aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-line" />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-lg bg-line" />
    </div>
  );
}

type TonoAviso = "ok" | "error";
let publicar: ((mensaje: string, tono: TonoAviso) => void) | null = null;

export function avisar(mensaje: string, tono: TonoAviso = "ok") {
  publicar?.(mensaje, tono);
}

export function Toaster() {
  const [avisos, setAvisos] = useState<{ id: number; mensaje: string; tono: TonoAviso }[]>([]);
  useEffect(() => {
    publicar = (mensaje, tono) => {
      const id = Date.now();
      setAvisos((prev) => [...prev, { id, mensaje, tono }]);
      window.setTimeout(() => setAvisos((prev) => prev.filter((aviso) => aviso.id !== id)), 5000);
    };
    return () => {
      publicar = null;
    };
  }, []);
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 grid w-[min(24rem,calc(100%-2rem))] gap-2" aria-live="polite">
      {avisos.map((aviso) => (
        <p key={aviso.id} role="status" className={`pointer-events-auto rounded-lg border px-3 py-2 text-sm shadow ${aviso.tono === "ok" ? "border-pine bg-white" : "border-alert bg-white text-alert"}`}>
          {aviso.mensaje}
        </p>
      ))}
    </div>
  );
}

export interface Columna<T> {
  id: string;
  titulo: string;
  valor: (fila: T) => string;
  celda?: (fila: T) => ReactNode;
}

export function Tabla<T extends { id: string }>({
  filas,
  columnas,
  etiqueta,
  vacio,
}: {
  filas: T[];
  columnas: Columna<T>[];
  etiqueta: string;
  vacio: string;
}) {
  const [buscar, setBuscar] = useState("");
  const [orden, setOrden] = useState(columnas[0]?.id ?? "");
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc");
  const [pagina, setPagina] = useState(0);
  const tamano = 8;
  const filtradas = useMemo(() => {
    const texto = buscar.trim().toLowerCase();
    const base = texto
      ? filas.filter((fila) => columnas.some((columna) => columna.valor(fila).toLowerCase().includes(texto)))
      : filas;
    const columna = columnas.find((item) => item.id === orden) ?? columnas[0];
    const copia = [...base];
    if (columna) {
      copia.sort((a, b) => columna.valor(a).localeCompare(columna.valor(b), "es"));
      if (direccion === "desc") copia.reverse();
    }
    return copia;
  }, [buscar, columnas, direccion, filas, orden]);
  const paginas = Math.max(1, Math.ceil(filtradas.length / tamano));
  const vista = filtradas.slice(pagina * tamano, pagina * tamano + tamano);
  useEffect(() => setPagina(0), [buscar, orden, direccion, filas]);
  if (filas.length === 0) return <Vacio texto={vacio} />;
  return (
    <div className="grid gap-3">
      <label className="grid max-w-sm gap-1 text-sm font-semibold">
        Buscar en la tabla
        <input className={claseCampo} value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="Nombre, hora, trámite…" />
      </label>
      <div className="overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
          <caption className="sr-only">{etiqueta}</caption>
          <thead className="bg-paper">
            <tr>
              {columnas.map((columna) => (
                <th key={columna.id} scope="col" aria-sort={orden === columna.id ? (direccion === "asc" ? "ascending" : "descending") : "none"} className="px-3 py-2">
                  <button
                    type="button"
                    className="font-semibold underline decoration-transparent hover:decoration-ink"
                    onClick={() => {
                      if (orden === columna.id) setDireccion((prev) => (prev === "asc" ? "desc" : "asc"));
                      else { setOrden(columna.id); setDireccion("asc"); }
                    }}
                  >
                    {columna.titulo}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vista.length === 0 ? (
              <tr><td className="px-3 py-4 text-muted" colSpan={columnas.length}>Ninguna fila coincide con la búsqueda.</td></tr>
            ) : vista.map((fila) => (
              <tr key={fila.id} className="border-t border-line">
                {columnas.map((columna) => (
                  <td key={columna.id} className="px-3 py-2">{columna.celda ? columna.celda(fila) : columna.valor(fila)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-sm">
        <p className="text-muted">{filtradas.length} filas</p>
        <div className="flex gap-2">
          <button type="button" className="rounded-md border border-line px-3 py-1" disabled={pagina === 0} onClick={() => setPagina((n) => n - 1)}>Anterior</button>
          <span>{pagina + 1} / {paginas}</span>
          <button type="button" className="rounded-md border border-line px-3 py-1" disabled={pagina + 1 >= paginas} onClick={() => setPagina((n) => n + 1)}>Siguiente</button>
        </div>
      </div>
    </div>
  );
}
