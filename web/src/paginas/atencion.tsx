import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { bloquePosterior } from "../../../src/domain/tiempo";
import { mascaraRut } from "../../../src/domain/rut";
import { api, fechaHoy } from "../api";
import { useAuth } from "../auth";
import { Ayuda, useAtajos } from "../atajos";
import { avisar } from "../ui";
import { useVivo } from "../vivo";

interface Cita {
  id: string;
  hora: string;
  agenda_id: string;
  estado: string;
  tramite: string;
  rut: string;
  nombre: string;
  docs_cargados: number;
  docs_requeridos: number;
  atencion_at?: string | null;
}
interface Lista {
  fecha: string;
  citas: Cita[];
  contadores: { total: number; confirmadas: number; pendientes: number; noAsistieron: number };
}

const ESTADOS = [
  ["", "Todas"],
  ["POR_LLEGAR", "Por llegar"],
  ["SIN_MARCAR", "Sin marcar"],
  ["ASISTIO", "Llegó"],
  ["ATRASADO", "Atrasado"],
  ["ATENDIDO", "Atendido"],
  ["NO_ASISTIO", "No asistió"],
] as const;

export function Atencion() {
  const { usuario } = useAuth();
  const hoy = fechaHoy();
  const busca = useRef<HTMLInputElement>(null);
  const [agenda, setAgenda] = useState("");
  const [q, setQ] = useState("");
  const [estado, setEstado] = useState("");
  const [datos, setDatos] = useState<Lista | null>(null);
  const [elegida, setElegida] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(() => {
    const params = new URLSearchParams({ fecha: hoy });
    if (agenda) params.set("agenda", agenda);
    if (q.trim()) params.set("q", q.trim());
    void api<Lista>(`/api/lista-dia?${params}`)
      .then((lista) => {
        setDatos(lista);
        setError("");
      })
      .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo cargar."));
  }, [agenda, hoy, q]);

  useEffect(() => {
    document.title = "Atención del día · Licencias Recoleta";
    cargar();
  }, [cargar]);
  useVivo(useCallback(() => cargar(), [cargar]));

  const ahora = new Date();
  const citas = (datos?.citas ?? []).filter((cita) => coincide(cita, estado, hoy, ahora));
  const proxima = citas.find((cita) => cita.estado === "AGENDADA" && bloquePosterior(hoy, cita.hora, ahora))
    ?? citas.find((cita) => cita.estado === "AGENDADA")
    ?? citas[0];
  const activa = citas.find((cita) => cita.id === elegida) ?? proxima;
  const indice = Math.max(0, citas.findIndex((cita) => cita.id === activa?.id));
  const puedeCerrar = usuario?.rol === "RECEPCION" || usuario?.rol === "ADMIN";

  async function atender(id: string) {
    if (ocupado) return;
    setOcupado(true);
    try {
      await api(`/api/citas/${id}/atencion`, { method: "POST", body: {} });
      avisar("Atención registrada.");
      cargar();
    } catch (falla) {
      avisar(falla instanceof Error ? falla.message : "No se pudo marcar.", "error");
    } finally {
      setOcupado(false);
    }
  }

  async function marcar(id: string, valor: string) {
    if (ocupado) return;
    setOcupado(true);
    try {
      await api(`/api/citas/${id}/asistencia`, { method: "POST", body: { estado: valor } });
      avisar(valor === "AGENDADA" ? "Llegada deshecha." : "Asistencia actualizada.");
      cargar();
    } catch (falla) {
      avisar(falla instanceof Error ? falla.message : "No se pudo marcar.", "error");
    } finally {
      setOcupado(false);
    }
  }

  const contadores = datos?.contadores;
  const sinMarcar = (datos?.citas ?? []).filter((cita) => cita.estado === "AGENDADA" && !bloquePosterior(hoy, cita.hora, ahora)).length;
  const porLlegar = (datos?.citas ?? []).filter((cita) => cita.estado === "AGENDADA" && bloquePosterior(hoy, cita.hora, ahora)).length;
  const ayuda = useMemo(() => [
    { tecla: "/", accion: "Buscar" },
    { tecla: "↑ ↓", accion: "Persona" },
    { tecla: "L", accion: "Llegó" },
    { tecla: "A", accion: "Atrasado" },
    { tecla: "N", accion: "No asistió" },
    { tecla: "U", accion: "Deshacer" },
    { tecla: "?", accion: "Esta ayuda" },
  ], []);
  const atajos = useAtajos(useMemo(() => ({
    "/": () => busca.current?.focus(),
    ArrowDown: () => setElegida(citas[Math.min(citas.length - 1, indice + 1)]?.id ?? ""),
    ArrowUp: () => setElegida(citas[Math.max(0, indice - 1)]?.id ?? ""),
    l: () => { if (activa && activa.estado === "AGENDADA") void marcar(activa.id, "ASISTIO"); },
    L: () => { if (activa && activa.estado === "AGENDADA") void marcar(activa.id, "ASISTIO"); },
    a: () => { if (activa && activa.estado === "AGENDADA") void marcar(activa.id, "ATRASADO"); },
    A: () => { if (activa && activa.estado === "AGENDADA") void marcar(activa.id, "ATRASADO"); },
    n: () => { if (activa && activa.estado === "AGENDADA") void marcar(activa.id, "NO_ASISTIO"); },
    N: () => { if (activa && activa.estado === "AGENDADA") void marcar(activa.id, "NO_ASISTIO"); },
    u: () => { if (activa && activa.estado !== "AGENDADA") void marcar(activa.id, "AGENDADA"); },
    U: () => { if (activa && activa.estado !== "AGENDADA") void marcar(activa.id, "AGENDADA"); },
  }), [activa, citas, indice]), ayuda);
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">Atención del día</h1>
        <p className="text-sm text-muted">{hoy.split("-").reverse().join("-")}</p>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-alert">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Contador etiqueta="Citadas" valor={contadores?.total ?? 0} />
        <Contador etiqueta="Por llegar" valor={porLlegar} />
        <Contador etiqueta="Sin marcar" valor={sinMarcar} />
        <Contador etiqueta="Inasistencias" valor={contadores?.noAsistieron ?? 0} />
      </div>
      {puedeCerrar ? <button type="button" className="min-h-11 justify-self-start rounded-lg bg-pine px-4 text-sm font-semibold text-white" onClick={() => void api("/api/jornada/cerrar", { method: "POST", body: {} }).then(() => { avisar("Jornada cerrada."); cargar(); }).catch((falla: unknown) => avisar(falla instanceof Error ? falla.message : "No se pudo cerrar.", "error"))}>Cerrar jornada</button> : null}
      <div className="flex flex-wrap gap-2">
        {[["", "Ambas"], ["GENERAL", "General"], ["PRIMERA_VEZ", "Primera vez"]].map(([id, texto]) => (
          <button key={id || "todas"} type="button" aria-pressed={agenda === id} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${agenda === id ? "bg-pine text-white" : "border border-line bg-white"}`} onClick={() => setAgenda(id)}>{texto}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Buscar</span>
          <input ref={busca} className="h-12 w-full rounded-lg border border-line px-3 text-base" placeholder="RUT o nombre" value={q} onChange={(e) => setQ(/\d/.test(e.target.value) ? mascaraRut(e.target.value) : e.target.value)} />
        </label>
        <label>
          <span className="sr-only">Estado</span>
          <select className="h-12 rounded-lg border border-line bg-white px-3 text-base" value={estado} onChange={(e) => setEstado(e.target.value)}>
            {ESTADOS.map(([id, texto]) => <option key={id || "todas"} value={id}>{texto}</option>)}
          </select>
        </label>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="superficie overflow-hidden">
          {citas.length === 0 ? <p className="p-6 text-sm text-muted">Sin citas</p> : null}
          <ul>
            {citas.map((cita) => (
              <li key={cita.id}>
                <button type="button" aria-pressed={activa?.id === cita.id} className={`grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3 text-left ${etiquetaCita(cita, hoy, ahora).clase} ${activa?.id === cita.id ? "ring-2 ring-inset ring-sky" : ""}`} onClick={() => setElegida(cita.id)}>
                  <span className="text-lg font-semibold tabular-nums">{cita.hora}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{cita.nombre}</span>
                    <span className="block truncate text-sm text-muted">{cita.tramite}</span>
                  </span>
                  <Marca texto={etiquetaCita(cita, hoy, ahora).texto} tono={etiquetaCita(cita, hoy, ahora).tono} />
                </button>
              </li>
            ))}
          </ul>
        </div>
        {activa ? (
          <aside className="superficie grid gap-3 p-4" aria-label="Ficha">
            <p className="text-sm text-muted">{activa.hora} · {activa.agenda_id === "PRIMERA_VEZ" ? "Primera vez" : "General"}</p>
            <h2 className="text-xl font-semibold">{activa.nombre}</h2>
            <p>{activa.rut}</p>
            <p className="text-sm">{activa.tramite}</p>
            <p className="text-sm text-muted">{activa.docs_cargados} de {activa.docs_requeridos} documentos</p>
            <Marca texto={etiquetaCita(activa, hoy, ahora).texto} tono={etiquetaCita(activa, hoy, ahora).tono} />
            <div className="grid gap-2">
              {activa.estado === "AGENDADA" ? (
                <>
                  <button type="button" className="min-h-12 rounded-lg bg-sky text-base font-semibold text-white" disabled={ocupado} onClick={() => void marcar(activa.id, "ASISTIO")}>Llegó</button>
                  <button type="button" className="min-h-12 rounded-lg border border-line bg-white text-base font-semibold" disabled={ocupado} onClick={() => void marcar(activa.id, "ATRASADO")}>Atrasado</button>
                  <button type="button" className="min-h-12 rounded-lg border border-line bg-white text-base font-semibold" disabled={ocupado} onClick={() => void marcar(activa.id, "NO_ASISTIO")}>No asistió</button>
                </>
              ) : (
                <button type="button" className="min-h-12 rounded-lg border border-line bg-white text-base font-semibold" disabled={ocupado} onClick={() => void marcar(activa.id, "AGENDADA")}>Deshacer</button>
              )}
              {(activa.estado === "ASISTIO" || activa.estado === "ATRASADO") ? (
                <button type="button" className="min-h-12 rounded-lg bg-pine text-base font-semibold text-white" disabled={ocupado} onClick={() => void atender(activa.id)}>Atendido</button>
              ) : null}
            </div>
            <Link className="text-sm font-semibold text-sky" to={`/citas/${activa.id}`}>Abrir ficha</Link>
          </aside>
        ) : null}
      </div>
      <Ayuda abierta={atajos.abierta} ayuda={ayuda} onCerrar={atajos.cerrar} />
    </section>
  );
}

function coincide(cita: Cita, estado: string, hoy: string, ahora: Date): boolean {
  if (!estado) return true;
  if (estado === "POR_LLEGAR") return cita.estado === "AGENDADA" && bloquePosterior(hoy, cita.hora, ahora);
  if (estado === "SIN_MARCAR") return cita.estado === "AGENDADA" && !bloquePosterior(hoy, cita.hora, ahora);
  if (estado === "ATENDIDO") return Boolean(cita.atencion_at);
  if (cita.atencion_at) return false;
  return cita.estado === estado;
}

function etiquetaCita(cita: Cita, hoy: string, ahora: Date): { texto: string; tono: string; clase: string } {
  if (cita.atencion_at) return { texto: "Atendido", tono: "bg-[#e5f6ec] text-[#146c43]", clase: "" };
  if (cita.estado === "AGENDADA" && !bloquePosterior(hoy, cita.hora, ahora)) return { texto: "Sin marcar", tono: "bg-[#f8e8e6] text-alert", clase: "bg-[#fff6f5]" };
  if (cita.estado === "AGENDADA") return { texto: "Por llegar", tono: "bg-[#e7eefc] text-[#1e3a8a]", clase: "bg-[#f8fbff]" };
  if (cita.estado === "ASISTIO") return { texto: "Llegó", tono: "bg-[#e5f6ec] text-[#146c43]", clase: "" };
  if (cita.estado === "ATRASADO") return { texto: "Atrasado", tono: "bg-[#fff1dc] text-[#9a5b00]", clase: "" };
  if (cita.estado === "NO_ASISTIO") return { texto: "No asistió", tono: "bg-[#eef1f5] text-[#586a80]", clase: "" };
  return { texto: cita.estado, tono: "bg-paper", clase: "" };
}

function Marca({ texto, tono }: { texto: string; tono: string }) {
  return <span className={`inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold ${tono}`}>{texto}</span>;
}

function Contador({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <article className="superficie px-3 py-3">
      <p className="text-xs font-medium text-muted">{etiqueta}</p>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
    </article>
  );
}
