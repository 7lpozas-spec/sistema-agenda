import { Camera, ExternalLink, Printer, Undo2, UserPlus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { bloquePosterior } from "../../../src/domain/tiempo";
import { mascaraRut, normalizarRut } from "../../../src/domain/rut";
import { api, fechaHoy } from "../api";
import { useAuth } from "../auth";
import { Ayuda, useAtajos } from "../atajos";
import { Fecha, textoFecha } from "../fecha";
import { Docs, avisar } from "../ui";
import { useVivo } from "../vivo";

interface Cita {
  id: string;
  hora: string;
  agenda_id: string;
  estado: string;
  tramite: string;
  rut: string;
  nombre: string;
  es_sobrecupo: number;
  docs_cargados: number;
  docs_requeridos: number;
  atencion_at?: string | null;
  asistencia_at?: string | null;
}
interface Lista {
  fecha: string;
  citas: Cita[];
  contadores: { total: number; confirmadas: number; pendientes: number; noAsistieron: number };
}
interface AtencionSinHora {
  id: string;
  numero: number;
  numeroTexto: string;
  rut: string;
  nombre: string;
  servicioId: string;
  servicio: string;
  observacion: string | null;
  estado: "EN_ESPERA" | "EN_ATENCION" | "ATENDIDO" | "SE_RETIRO";
  llegadaAt: string;
  atencionAt: string | null;
  terminoAt: string | null;
  registradoPor: string;
  atendidoPor: string | null;
}
interface Resumen { total: number; enEspera: number; enAtencion: number; atendidos: number; seRetiraron: number; esperaMin: number | null }
interface Meson { fecha: string; atenciones: AtencionSinHora[]; resumen: Resumen }
interface Servicio { id: string; nombre: string }
interface Persona { rut: string; nombre: string | null; conocido: boolean; visitas: number; ultimaVisita: string | null; citaHoy: { id: string; hora: string; estado: string; tramite: string } | null }

const FILTROS_CITA = [
  ["", "Todas"],
  ["POR_LLEGAR", "Por llegar"],
  ["SIN_MARCAR", "Sin marcar"],
  ["EN_ESPERA", "En espera"],
  ["ATENDIDO", "Atendidos"],
  ["NO_ASISTIO", "No asistió"],
] as const;
const FILTROS_SIN_HORA = [
  ["", "Todos"],
  ["EN_ESPERA", "En espera"],
  ["EN_ATENCION", "En atención"],
  ["ATENDIDO", "Atendidos"],
  ["SE_RETIRO", "Se retiró"],
] as const;

function minutosEntre(desde?: string | null, hasta?: string | null | Date): number | null {
  if (!desde) return null;
  const inicio = new Date(desde).getTime();
  const fin = hasta instanceof Date ? hasta.getTime() : hasta ? new Date(hasta).getTime() : Date.now();
  if (Number.isNaN(inicio) || Number.isNaN(fin)) return null;
  return Math.max(0, Math.round((fin - inicio) / 60_000));
}

function horaLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
}

function useReloj(ms = 30_000): Date {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return ahora;
}

export function Atencion() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMIN";
  const puedeSinHora = usuario?.rol === "RECEPCION" || esAdmin;
  const puedeCerrar = puedeSinHora;
  const hoy = fechaHoy();
  const [params, setParams] = useSearchParams();
  const vista = params.get("vista") === "sin-hora" && puedeSinHora ? "sin-hora" : "citas";
  const [fecha, setFecha] = useState(hoy);
  const esHoy = fecha === hoy;
  const busca = useRef<HTMLInputElement>(null);
  const rutNuevo = useRef<HTMLInputElement>(null);
  const [agenda, setAgenda] = useState("");
  const [q, setQ] = useState("");
  const [filtroCita, setFiltroCita] = useState("");
  const [filtroSinHora, setFiltroSinHora] = useState("");
  const [lista, setLista] = useState<Lista | null>(null);
  const [meson, setMeson] = useState<Meson | null>(null);
  const [elegida, setElegida] = useState("");
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [confirmarCierre, setConfirmarCierre] = useState(false);
  const ahora = useReloj();

  const cargar = useCallback(() => {
    const p = new URLSearchParams({ fecha });
    if (agenda) p.set("agenda", agenda);
    if (q.trim() && vista === "citas") p.set("q", q.trim());
    const tareas: Promise<unknown>[] = [
      api<Lista>(`/api/lista-dia?${p}`).then(setLista),
    ];
    if (puedeSinHora) {
      const m = new URLSearchParams({ fecha });
      if (q.trim() && vista === "sin-hora") m.set("q", q.trim());
      tareas.push(api<Meson>(`/api/meson?${m}`).then(setMeson));
    }
    void Promise.all(tareas)
      .then(() => setError(""))
      .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo cargar."));
  }, [agenda, fecha, q, vista, puedeSinHora]);

  useEffect(() => {
    document.title = "Atención del día · Licencias Recoleta";
    const t = window.setTimeout(cargar, q ? 180 : 0);
    return () => window.clearTimeout(t);
  }, [cargar, q]);
  useVivo(useCallback(() => cargar(), [cargar]));

  function cambiarVista(nueva: "citas" | "sin-hora") {
    setQ("");
    setElegida("");
    setParams(nueva === "sin-hora" ? { vista: "sin-hora" } : {}, { replace: true });
  }

  async function accion(clave: string, tarea: () => Promise<unknown>, mensaje: string) {
    if (ocupado) return;
    setOcupado(clave);
    try {
      await tarea();
      avisar(mensaje);
      cargar();
    } catch (falla) {
      avisar(falla instanceof Error ? falla.message : "No se pudo completar.", "error");
      cargar();
    } finally {
      setOcupado("");
    }
  }
  const marcar = (id: string, valor: string) =>
    accion(`${id}:${valor}`, () => api(`/api/citas/${id}/asistencia`, { method: "POST", body: { estado: valor } }), valor === "AGENDADA" ? "Marca deshecha." : valor === "NO_ASISTIO" ? "Inasistencia registrada." : "Llegada registrada.");
  const atender = (id: string) => accion(`${id}:ATENDIDO`, () => api(`/api/citas/${id}/atencion`, { method: "POST", body: {} }), "Atención registrada.");
  const estadoSinHora = (id: string, estado: string) =>
    accion(`${id}:${estado}`, () => api(`/api/meson/${id}/estado`, { method: "POST", body: { estado } }), estado === "EN_ESPERA" ? "Marca deshecha." : estado === "SE_RETIRO" ? "Registrado: se retiró." : estado === "EN_ATENCION" ? "En atención." : "Atención finalizada.");

  function cerrarJornada() {
    if (!confirmarCierre) {
      setConfirmarCierre(true);
      window.setTimeout(() => setConfirmarCierre(false), 4000);
      return;
    }
    setConfirmarCierre(false);
    void accion("cierre", () => api<{ marcadas: number }>("/api/jornada/cerrar", { method: "POST", body: {} }).then((r) => avisar(`${r.marcadas} inasistencias marcadas.`)), "Jornada cerrada.");
  }

  const todas = lista?.citas ?? [];
  const citas = todas.filter((cita) => coincide(cita, filtroCita, fecha, ahora));
  const atenciones = (meson?.atenciones ?? []).filter((fila) => !filtroSinHora || fila.estado === filtroSinHora);
  const filas = vista === "citas" ? citas.map((c) => c.id) : atenciones.map((a) => a.id);
  const indice = Math.max(0, filas.indexOf(elegida));
  const activaCita = vista === "citas" ? citas.find((c) => c.id === elegida) : undefined;
  const activaSinHora = vista === "sin-hora" ? atenciones.find((a) => a.id === elegida) : undefined;

  const conteo = useMemo(() => {
    const porLlegar = todas.filter((c) => c.estado === "AGENDADA" && bloquePosterior(fecha, c.hora, ahora)).length;
    const sinMarcar = todas.filter((c) => c.estado === "AGENDADA" && !bloquePosterior(fecha, c.hora, ahora)).length;
    const enEspera = todas.filter((c) => (c.estado === "ASISTIO" || c.estado === "ATRASADO") && !c.atencion_at).length;
    const atendidos = todas.filter((c) => c.atencion_at).length;
    const esperas = todas.filter((c) => c.atencion_at && c.asistencia_at).map((c) => minutosEntre(c.asistencia_at, c.atencion_at) ?? 0);
    const espera = esperas.length ? Math.round(esperas.reduce((a, b) => a + b, 0) / esperas.length) : null;
    return { porLlegar, sinMarcar, enEspera, atendidos, espera, inasistencias: todas.filter((c) => c.estado === "NO_ASISTIO").length };
  }, [todas, fecha, ahora]);

  const ayuda = useMemo(() => [
    { tecla: "/", accion: "Buscar" },
    { tecla: "1 · 2", accion: "Con hora · Sin hora" },
    { tecla: "R", accion: "Registrar sin hora" },
    { tecla: "↑ ↓", accion: "Fila" },
    { tecla: "L", accion: "Llegó" },
    { tecla: "A", accion: "Atrasado" },
    { tecla: "N", accion: "No asistió" },
    { tecla: "T", accion: "Atendido" },
    { tecla: "U", accion: "Deshacer" },
    { tecla: "?", accion: "Atajos" },
  ], []);
  const atajos = useAtajos(useMemo(() => {
    const mover = (paso: number) => setElegida(filas[Math.min(filas.length - 1, Math.max(0, indice + paso))] ?? "");
    const enCita = (fn: (c: Cita) => void) => () => { if (activaCita && esHoy) fn(activaCita); };
    const enSinHora = (fn: (a: AtencionSinHora) => void) => () => { if (activaSinHora && esHoy) fn(activaSinHora); };
    const l = enCita((c) => { if (c.estado === "AGENDADA") void marcar(c.id, "ASISTIO"); });
    const a = enCita((c) => { if (c.estado === "AGENDADA") void marcar(c.id, "ATRASADO"); });
    const n = enCita((c) => { if (c.estado === "AGENDADA") void marcar(c.id, "NO_ASISTIO"); });
    const t = vista === "citas"
      ? enCita((c) => { if ((c.estado === "ASISTIO" || c.estado === "ATRASADO") && !c.atencion_at) void atender(c.id); })
      : enSinHora((s) => { if (s.estado === "EN_ESPERA" || s.estado === "EN_ATENCION") void estadoSinHora(s.id, "ATENDIDO"); });
    const u = vista === "citas"
      ? enCita((c) => { if (c.estado !== "AGENDADA" && !c.atencion_at) void marcar(c.id, "AGENDADA"); })
      : enSinHora((s) => { if (s.estado !== "EN_ESPERA") void estadoSinHora(s.id, "EN_ESPERA"); });
    const r = () => { if (!puedeSinHora || !esHoy) return; cambiarVista("sin-hora"); window.setTimeout(() => rutNuevo.current?.focus(), 30); };
    return {
      "/": () => busca.current?.focus(),
      "1": () => cambiarVista("citas"),
      "2": () => { if (puedeSinHora) cambiarVista("sin-hora"); },
      ArrowDown: () => mover(1), ArrowUp: () => mover(-1),
      l, L: l, a, A: a, n, N: n, t, T: t, u, U: u, r, R: r,
    };
  }, [filas, indice, activaCita, activaSinHora, vista, esHoy, puedeSinHora]), ayuda);

  const resumen = meson?.resumen;
  const docsPendientes = (lista?.citas ?? []).filter((cita) => cita.docs_requeridos > 0 && cita.docs_cargados < cita.docs_requeridos && cita.estado !== "NO_ASISTIO" && cita.estado !== "CANCELADA" && cita.estado !== "ANULADA").length;
  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Atención del día</h1>
        <span className="text-sm text-muted tabular-nums">{textoFecha(fecha)}</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {esAdmin ? <div className="w-40"><Fecha id="fecha-atencion" etiqueta="Fecha" valor={fecha} alCambiar={(valor) => setFecha(valor || hoy)} laborables={[1, 2, 3, 4, 5, 6, 7]} /></div> : null}
          {puedeCerrar && esHoy ? (
            <button type="button" className={`hidden h-9 rounded-lg px-3 text-sm font-semibold md:inline-flex md:items-center ${confirmarCierre ? "bg-alert text-white" : "border border-line bg-white text-ink hover:bg-paper"}`} onClick={cerrarJornada} disabled={ocupado === "cierre"}>
              {confirmarCierre ? `Confirmar: ${conteo.sinMarcar} sin marcar → No asistió` : "Cerrar jornada"}
            </button>
          ) : null}
        </div>
      </header>

      {error ? <p role="alert" className="rounded-lg border border-alert/30 bg-red-50 px-3 py-2 text-sm text-alert">{error}</p> : null}

      <div className="superficie hidden divide-line md:grid md:grid-cols-7 md:divide-x lg:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,1.6fr)]">
        <Kpi etiqueta="Citadas" valor={lista?.contadores.total ?? 0} />
        <Kpi etiqueta="Por llegar" valor={conteo.porLlegar} />
        <Kpi etiqueta="En espera" valor={conteo.enEspera} tono={conteo.enEspera > 0 ? "aviso" : undefined} />
        <Kpi etiqueta="Atendidos" valor={conteo.atendidos} detalle={conteo.espera !== null ? `${conteo.espera} min prom.` : undefined} />
        <Kpi etiqueta="Sin marcar" valor={conteo.sinMarcar} tono={conteo.sinMarcar > 0 ? "alerta" : undefined} />
        <Kpi etiqueta="Inasistencias" valor={conteo.inasistencias} />
        <Kpi etiqueta="Docs pendientes" valor={docsPendientes} tono={docsPendientes > 0 ? "aviso" : undefined} />
        {puedeSinHora ? (
          <div className="col-span-7 flex items-center gap-4 border-t border-line bg-[#f7f9fc] px-3 py-2 lg:col-span-1 lg:border-t-0">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Sin hora en espera</p>
              <p className="flex items-baseline gap-2 whitespace-nowrap tabular-nums">
                <span className={`text-xl font-semibold ${(resumen?.enEspera ?? 0) > 0 ? "text-[#9a5b00]" : ""}`}>{resumen?.enEspera ?? 0}</span>
                <span className="text-[11px] text-muted">{resumen?.atendidos ?? 0} atendidos{resumen?.esperaMin !== null && resumen?.esperaMin !== undefined ? ` · ${resumen.esperaMin} min prom.` : ""}</span>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Lista" className="flex rounded-lg border border-line bg-white p-0.5">
          <Pestana activa={vista === "citas"} onClick={() => cambiarVista("citas")}>Con hora <Cuenta n={lista?.contadores.total ?? 0} /></Pestana>
          {puedeSinHora ? <Pestana activa={vista === "sin-hora"} onClick={() => cambiarVista("sin-hora")}>Sin hora <Cuenta n={meson?.resumen.total ?? 0} destacar={(resumen?.enEspera ?? 0) > 0} /></Pestana> : null}
        </div>
        <label className="relative min-w-[14rem] flex-1">
          <span className="sr-only">Buscar</span>
          <input ref={busca} className="h-9 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-sky" placeholder={vista === "citas" ? "RUT, nombre o folio" : "RUT, nombre o número"} value={q} onChange={(e) => setQ(/^\d/.test(e.target.value) ? mascaraRut(e.target.value) : e.target.value)} />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line px-1 text-[10px] text-muted">/</kbd>
        </label>
        {vista === "citas" ? (
          <>
            <div className="flex rounded-lg border border-line bg-white p-0.5">
              {[["", "Ambas"], ["GENERAL", "General"], ["PRIMERA_VEZ", "Primera vez"]].map(([id, texto]) => (
                <Pestana key={id || "ambas"} activa={agenda === id} onClick={() => setAgenda(id)}>{texto}</Pestana>
              ))}
            </div>
            <Selector etiqueta="Estado" valor={filtroCita} opciones={FILTROS_CITA} alCambiar={setFiltroCita} />
          </>
        ) : (
          <Selector etiqueta="Estado" valor={filtroSinHora} opciones={FILTROS_SIN_HORA} alCambiar={setFiltroSinHora} />
        )}
      </div>

      {vista === "sin-hora" && esHoy ? <RegistroSinHora inputRef={rutNuevo} onRegistrado={(id) => { setElegida(id); cargar(); }} /> : null}

      {vista === "citas" ? (
        <TablaCitas citas={citas} fecha={fecha} ahora={ahora} elegida={elegida} onElegir={setElegida} ocupado={ocupado} editable={esHoy || esAdmin} marcar={marcar} atender={atender} cargada={Boolean(lista)} />
      ) : (
        <TablaSinHora filas={atenciones} ahora={ahora} elegida={elegida} onElegir={setElegida} ocupado={ocupado} editable={esHoy || esAdmin} cambiar={estadoSinHora} cargada={Boolean(meson)} />
      )}
      <Ayuda abierta={atajos.abierta} ayuda={ayuda} onCerrar={atajos.cerrar} />
    </section>
  );
}

function Kpi({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: number; detalle?: string; tono?: "aviso" | "alerta" }) {
  const color = tono === "alerta" ? "text-alert" : tono === "aviso" ? "text-[#9a5b00]" : "text-ink";
  return (
    <div className="px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{etiqueta}</p>
      <p className="flex items-baseline gap-2">
        <span className={`text-xl font-semibold tabular-nums ${color}`}>{valor}</span>
        {detalle ? <span className="truncate text-[11px] text-muted">{detalle}</span> : null}
      </p>
    </div>
  );
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" role="tab" aria-selected={activa} onClick={onClick} className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition-colors ${activa ? "bg-pine text-white" : "text-muted hover:text-ink"}`}>
      {children}
    </button>
  );
}

function Cuenta({ n, destacar = false }: { n: number; destacar?: boolean }) {
  return <span className={`rounded px-1.5 text-[11px] tabular-nums ${destacar ? "bg-[#fff1dc] text-[#9a5b00]" : "bg-black/10"}`}>{n}</span>;
}

function Selector({ etiqueta, valor, opciones, alCambiar }: { etiqueta: string; valor: string; opciones: readonly (readonly [string, string])[]; alCambiar: (v: string) => void }) {
  return (
    <label>
      <span className="sr-only">{etiqueta}</span>
      <select className="h-9 rounded-lg border border-line bg-white px-2 text-sm" value={valor} onChange={(e) => alCambiar(e.target.value)}>
        {opciones.map(([id, texto]) => <option key={id || "todas"} value={id}>{texto}</option>)}
      </select>
    </label>
  );
}

function Accion({ children, onClick, tono = "neutro", disabled, titulo }: { children: ReactNode; onClick: () => void; tono?: "primario" | "exito" | "neutro" | "peligro"; disabled?: boolean; titulo?: string }) {
  const clases = {
    primario: "bg-sky text-white hover:bg-[#2a51cc]",
    exito: "bg-pine text-white hover:bg-pine-dark",
    neutro: "border border-line bg-white text-ink hover:bg-paper",
    peligro: "border border-line bg-white text-alert hover:bg-red-50",
  }[tono];
  return (
    <button type="button" title={titulo} aria-label={titulo} disabled={disabled} onClick={(e) => { e.stopPropagation(); onClick(); }} className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-md px-2.5 text-[13px] font-semibold disabled:opacity-50 ${clases}`}>
      {children}
    </button>
  );
}

function Pastilla({ texto, tono }: { texto: string; tono: string }) {
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2 text-[11px] font-semibold ${tono}`}>{texto}</span>;
}

function Espera({ minutos, viva }: { minutos: number | null; viva: boolean }) {
  if (minutos === null) return <span className="text-muted">—</span>;
  const tono = viva ? (minutos >= 30 ? "text-alert font-semibold" : minutos >= 15 ? "text-[#9a5b00] font-semibold" : "text-ink") : "text-muted";
  const texto = minutos >= 60 ? `${Math.floor(minutos / 60)} h ${String(minutos % 60).padStart(2, "0")}` : `${minutos} min`;
  return <span className={`tabular-nums ${tono}`}>{texto}</span>;
}

function TablaCitas({ citas, fecha, ahora, elegida, onElegir, ocupado, editable, marcar, atender, cargada }: {
  citas: Cita[]; fecha: string; ahora: Date; elegida: string; onElegir: (id: string) => void; ocupado: string; editable: boolean;
  marcar: (id: string, estado: string) => void; atender: (id: string) => void; cargada: boolean;
}) {
  if (!cargada) return <div className="superficie h-64 animate-pulse" aria-hidden />;
  if (citas.length === 0) return <div className="superficie px-4 py-8 text-center text-sm text-muted">Sin citas</div>;
  return (
    <>
    <ul className="superficie divide-y divide-[#eef2f7] overflow-hidden md:hidden" aria-label="Citas del día">
      {citas.map((cita) => {
        const etiqueta = etiquetaCita(cita, fecha, ahora);
        const faltan = cita.docs_requeridos > 0 && cita.docs_cargados < cita.docs_requeridos;
        return (
          <li key={cita.id} className={`flex items-center gap-3 px-3 py-2.5 ${etiqueta.fila}`}>
            <Link to={`/citas/${cita.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <span className="w-12 shrink-0 text-base font-semibold tabular-nums">{cita.hora}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{cita.nombre}</span>
                <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                  <Pastilla texto={etiqueta.texto} tono={etiqueta.tono} />
                  <Docs cargados={cita.docs_cargados} requeridos={cita.docs_requeridos} />
                </span>
              </span>
            </Link>
            {faltan ? (
              <Link to={`/citas/${cita.id}`} aria-label={`Fotografiar documentos de ${cita.nombre}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#fff1dc] text-[#9a5b00]"><Camera size={20} aria-hidden /></Link>
            ) : editable && cita.estado === "AGENDADA" ? (
              <button type="button" disabled={Boolean(ocupado)} className="h-11 shrink-0 rounded-lg bg-sky px-3 text-sm font-semibold text-white" onClick={() => marcar(cita.id, "ASISTIO")}>Llegó</button>
            ) : null}
          </li>
        );
      })}
    </ul>
    <div className="superficie hidden overflow-hidden md:block">
      <div className="max-h-[calc(100vh-17rem)] min-h-64 overflow-auto">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Citas del día</caption>
          <colgroup>
            <col className="w-16" />
            <col />
            <col className="hidden w-32 xl:table-column" />
            <col className="hidden lg:table-column" />
            <col className="hidden w-28 xl:table-column" />
            <col className="hidden w-14 xl:table-column" />
            <col className="w-28" />
            <col className="w-20" />
            <col className="w-[17.5rem] lg:w-[19rem]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#f7f9fc] text-[11px] font-semibold uppercase tracking-wide text-muted shadow-[inset_0_-1px_0_var(--color-line)]">
            <tr>
              <th scope="col" className="w-16 px-3 py-2">Hora</th>
              <th scope="col" className="px-2 py-2">Persona</th>
              <th scope="col" className="hidden px-2 py-2 xl:table-cell">RUT</th>
              <th scope="col" className="hidden px-2 py-2 lg:table-cell">Trámite</th>
              <th scope="col" className="hidden px-2 py-2 xl:table-cell">Agenda</th>
              <th scope="col" className="hidden px-2 py-2 text-center xl:table-cell">Docs</th>
              <th scope="col" className="px-2 py-2">Estado</th>
              <th scope="col" className="px-2 py-2 text-right">Espera</th>
              <th scope="col" className="px-3 py-2 text-right"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {citas.map((cita, i) => {
              const etiqueta = etiquetaCita(cita, fecha, ahora);
              const nuevaHora = i === 0 || citas[i - 1].hora !== cita.hora;
              const llego = cita.estado === "ASISTIO" || cita.estado === "ATRASADO";
              const espera = llego ? minutosEntre(cita.asistencia_at, cita.atencion_at ?? ahora) : null;
              const activa = elegida === cita.id;
              const clave = (estado: string) => ocupado === `${cita.id}:${estado}`;
              return (
                <tr key={cita.id} onClick={() => onElegir(cita.id)} aria-selected={activa} className={`cursor-default ${nuevaHora && i > 0 ? "border-t border-[#cfd9e6]" : "border-t border-[#eef2f7]"} ${activa ? "bg-[#eaf0ff]" : etiqueta.fila} hover:bg-[#f2f6fc]`}>
                  <td className={`px-3 py-1.5 align-middle font-semibold tabular-nums ${activa ? "shadow-[inset_3px_0_0_var(--color-sky)]" : ""}`}>{nuevaHora ? cita.hora : <span className="text-transparent">{cita.hora}</span>}</td>
                  <td className="max-w-0 px-2 py-1.5">
                    <p className="flex items-center gap-1.5"><span className="truncate font-semibold">{cita.nombre}</span>{cita.es_sobrecupo ? <span className="rounded bg-[#fff1dc] px-1 text-[10px] font-semibold text-[#9a5b00]">SC</span> : null}<span className="xl:hidden"><Docs cargados={cita.docs_cargados} requeridos={cita.docs_requeridos} compacto /></span></p>
                    <p className="truncate text-xs text-muted xl:hidden">{cita.rut}<span className="lg:hidden"> · {cita.tramite}</span><span className="xl:hidden"> · {cita.agenda_id === "PRIMERA_VEZ" ? "Primera vez" : "General"}</span></p>
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-1.5 tabular-nums text-muted xl:table-cell">{cita.rut}</td>
                  <td className="hidden max-w-0 px-2 py-1.5 lg:table-cell"><p className="truncate">{cita.tramite}</p></td>
                  <td className="hidden px-2 py-1.5 xl:table-cell"><span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${cita.agenda_id === "PRIMERA_VEZ" ? "bg-[#e6f4ec] text-[#0d5c38]" : "bg-[#e7eefc] text-[#0b4f8a]"}`}>{cita.agenda_id === "PRIMERA_VEZ" ? "Primera vez" : "General"}</span></td>
                  <td className="hidden px-2 py-1.5 text-center xl:table-cell">{cita.docs_requeridos > 0 ? <Docs cargados={cita.docs_cargados} requeridos={cita.docs_requeridos} compacto /> : <span className="text-muted">—</span>}</td>
                  <td className="px-2 py-1.5"><Pastilla texto={etiqueta.texto} tono={etiqueta.tono} /></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right"><Espera minutos={espera} viva={llego && !cita.atencion_at} /></td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      {editable && cita.estado === "AGENDADA" ? (
                        <>
                          <Accion tono="primario" disabled={Boolean(ocupado)} onClick={() => marcar(cita.id, "ASISTIO")}>{clave("ASISTIO") ? "…" : "Llegó"}</Accion>
                          <Accion disabled={Boolean(ocupado)} onClick={() => marcar(cita.id, "ATRASADO")}>Atrasado</Accion>
                          <Accion tono="peligro" disabled={Boolean(ocupado)} onClick={() => marcar(cita.id, "NO_ASISTIO")}>No asistió</Accion>
                        </>
                      ) : null}
                      {editable && llego && !cita.atencion_at ? <Accion tono="exito" disabled={Boolean(ocupado)} onClick={() => atender(cita.id)}>{clave("ATENDIDO") ? "…" : "Atendido"}</Accion> : null}
                      {editable && cita.estado !== "AGENDADA" && !cita.atencion_at ? <Accion titulo="Deshacer" disabled={Boolean(ocupado)} onClick={() => marcar(cita.id, "AGENDADA")}><Undo2 size={15} aria-hidden /></Accion> : null}
                      {cita.docs_requeridos > 0 && cita.docs_cargados < cita.docs_requeridos ? (
                        <Link className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[#fff1dc] text-[#9a5b00] hover:bg-[#ffe6c2]" title="Fotografiar documentos" aria-label="Fotografiar documentos" to={`/citas/${cita.id}`} onClick={(e) => e.stopPropagation()}><Camera size={15} aria-hidden /></Link>
                      ) : (
                        <a className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-paper hover:text-ink" title="Comprobante" aria-label="Comprobante" href={`/api/citas/${cita.id}/comprobante.pdf`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}><Printer size={15} aria-hidden /></a>
                      )}
                      <Link className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-paper hover:text-ink" title="Ficha" aria-label="Ficha" to={`/citas/${cita.id}`} onClick={(e) => e.stopPropagation()}><ExternalLink size={15} aria-hidden /></Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

const ESTADO_SIN_HORA: Record<AtencionSinHora["estado"], { texto: string; tono: string }> = {
  EN_ESPERA: { texto: "En espera", tono: "bg-[#fff1dc] text-[#9a5b00]" },
  EN_ATENCION: { texto: "En atención", tono: "bg-[#e7eefc] text-[#1e3a8a]" },
  ATENDIDO: { texto: "Atendido", tono: "bg-[#e5f6ec] text-[#146c43]" },
  SE_RETIRO: { texto: "Se retiró", tono: "bg-[#eef1f5] text-[#586a80]" },
};

function TablaSinHora({ filas, ahora, elegida, onElegir, ocupado, editable, cambiar, cargada }: {
  filas: AtencionSinHora[]; ahora: Date; elegida: string; onElegir: (id: string) => void; ocupado: string; editable: boolean;
  cambiar: (id: string, estado: string) => void; cargada: boolean;
}) {
  if (!cargada) return <div className="superficie h-64 animate-pulse" aria-hidden />;
  if (filas.length === 0) return <div className="superficie px-4 py-8 text-center text-sm text-muted">Sin atenciones</div>;
  return (
    <>
    <ul className="superficie divide-y divide-[#eef2f7] md:hidden" aria-label="Atenciones sin hora">
      {filas.map((fila) => {
        const abierta = fila.estado === "EN_ESPERA" || fila.estado === "EN_ATENCION";
        const espera = minutosEntre(fila.llegadaAt, fila.atencionAt ?? (fila.estado === "EN_ESPERA" ? ahora : fila.terminoAt));
        const estado = ESTADO_SIN_HORA[fila.estado];
        return (
          <li key={fila.id} className={`flex items-center gap-3 px-3 py-2.5 ${abierta ? "" : "text-muted"}`}>
            <span className="w-14 shrink-0 whitespace-nowrap font-semibold tabular-nums text-ink">{fila.numeroTexto}</span>
            <span className="min-w-0 flex-1">
              <span className={`block truncate font-semibold ${abierta ? "text-ink" : ""}`}>{fila.nombre}</span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs">
                <Pastilla texto={estado.texto} tono={estado.tono} />
                <span className="tabular-nums">{horaLocal(fila.llegadaAt)}</span>
                <Espera minutos={espera} viva={fila.estado === "EN_ESPERA"} />
              </span>
            </span>
            {editable && fila.estado === "EN_ESPERA" ? <button type="button" className="h-11 shrink-0 rounded-lg bg-sky px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={Boolean(ocupado)} onClick={() => cambiar(fila.id, "EN_ATENCION")}>Atender</button> : null}
            {editable && fila.estado === "EN_ATENCION" ? <button type="button" className="h-11 shrink-0 rounded-lg bg-pine px-3 text-sm font-semibold text-white disabled:opacity-50" disabled={Boolean(ocupado)} onClick={() => cambiar(fila.id, "ATENDIDO")}>Finalizar</button> : null}
          </li>
        );
      })}
    </ul>
    <div className="superficie hidden overflow-hidden md:block">
      <div className="max-h-[calc(100vh-21rem)] min-h-64 overflow-auto">
        <table className="w-full table-fixed border-collapse text-left text-sm">
          <caption className="sr-only">Atenciones sin hora</caption>
          <colgroup>
            <col className="w-16" />
            <col className="w-16" />
            <col />
            <col className="hidden w-32 xl:table-column" />
            <col className="hidden lg:table-column" />
            <col className="hidden w-44 xl:table-column" />
            <col className="w-28" />
            <col className="w-16" />
            <col className="w-[15.5rem] lg:w-[18rem]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[#f7f9fc] text-[11px] font-semibold uppercase tracking-wide text-muted shadow-[inset_0_-1px_0_var(--color-line)]">
            <tr>
              <th scope="col" className="w-16 px-3 py-2">N°</th>
              <th scope="col" className="w-16 px-2 py-2">Llegó</th>
              <th scope="col" className="px-2 py-2">Persona</th>
              <th scope="col" className="hidden px-2 py-2 xl:table-cell">RUT</th>
              <th scope="col" className="hidden px-2 py-2 lg:table-cell">Servicio</th>
              <th scope="col" className="hidden px-2 py-2 xl:table-cell">Registró</th>
              <th scope="col" className="px-2 py-2">Estado</th>
              <th scope="col" className="px-2 py-2 text-right">Espera</th>
              <th scope="col" className="px-3 py-2 text-right"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((fila) => {
              const activa = elegida === fila.id;
              const abierta = fila.estado === "EN_ESPERA" || fila.estado === "EN_ATENCION";
              const espera = minutosEntre(fila.llegadaAt, fila.atencionAt ?? (fila.estado === "EN_ESPERA" ? ahora : fila.terminoAt));
              const estado = ESTADO_SIN_HORA[fila.estado];
              return (
                <tr key={fila.id} onClick={() => onElegir(fila.id)} aria-selected={activa} className={`border-t border-[#eef2f7] ${activa ? "bg-[#eaf0ff]" : !abierta ? "text-muted" : ""} hover:bg-[#f2f6fc]`}>
                  <td className={`whitespace-nowrap px-3 py-1.5 font-semibold tabular-nums text-ink ${activa ? "shadow-[inset_3px_0_0_var(--color-sky)]" : ""}`}>{fila.numeroTexto}</td>
                  <td className="px-2 py-1.5 tabular-nums">{horaLocal(fila.llegadaAt)}</td>
                  <td className="max-w-0 px-2 py-1.5">
                    <p className={`truncate font-semibold ${abierta ? "text-ink" : ""}`}>{fila.nombre}</p>
                    <p className="truncate text-xs text-muted">
                      <span className="xl:hidden">{fila.rut}</span>
                      <span className="lg:hidden"> · {fila.servicio}</span>
                      {fila.observacion ? <span><span className="xl:hidden"> · </span>{fila.observacion}</span> : null}
                    </p>
                  </td>
                  <td className="hidden whitespace-nowrap px-2 py-1.5 tabular-nums text-muted xl:table-cell">{fila.rut}</td>
                  <td className="hidden max-w-0 px-2 py-1.5 lg:table-cell"><p className="truncate">{fila.servicio}</p></td>
                  <td className="hidden max-w-0 px-2 py-1.5 text-xs text-muted xl:table-cell"><p className="truncate" title={fila.atendidoPor ? `Atendió ${fila.atendidoPor}` : undefined}>{fila.registradoPor}</p></td>
                  <td className="px-2 py-1.5"><Pastilla texto={estado.texto} tono={estado.tono} /></td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right"><Espera minutos={espera} viva={fila.estado === "EN_ESPERA"} /></td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      {editable && fila.estado === "EN_ESPERA" ? <Accion tono="primario" disabled={Boolean(ocupado)} onClick={() => cambiar(fila.id, "EN_ATENCION")}>Atender</Accion> : null}
                      {editable && abierta ? <Accion tono="exito" disabled={Boolean(ocupado)} onClick={() => cambiar(fila.id, "ATENDIDO")}>{fila.estado === "EN_ATENCION" ? "Finalizar" : "Atendido"}</Accion> : null}
                      {editable && abierta ? <Accion tono="peligro" disabled={Boolean(ocupado)} onClick={() => cambiar(fila.id, "SE_RETIRO")}>Se retiró</Accion> : null}
                      {editable && fila.estado !== "EN_ESPERA" ? <Accion titulo="Deshacer" disabled={Boolean(ocupado)} onClick={() => cambiar(fila.id, "EN_ESPERA")}><Undo2 size={15} aria-hidden /></Accion> : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

function RegistroSinHora({ inputRef, onRegistrado }: { inputRef: React.RefObject<HTMLInputElement | null>; onRegistrado: (id: string) => void }) {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [rut, setRut] = useState("");
  const [nombre, setNombre] = useState("");
  const [servicio, setServicio] = useState("");
  const [observacion, setObservacion] = useState("");
  const [persona, setPersona] = useState<Persona | null>(null);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const nombreTocado = useRef(false);

  useEffect(() => {
    void api<{ servicios: Servicio[] }>("/api/meson/servicios")
      .then((datos) => { setServicios(datos.servicios); setServicio((actual) => actual || datos.servicios[0]?.id || ""); })
      .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudieron leer los servicios."));
  }, []);

  const rutValido = normalizarRut(rut);
  const rutCompleto = rut.replace(/[^0-9kK]/g, "").length >= 8;
  useEffect(() => {
    setPersona(null);
    if (!rutValido) return;
    const control = new AbortController();
    void api<Persona>(`/api/meson/persona?rut=${encodeURIComponent(rutValido)}`, { signal: control.signal })
      .then((datos) => {
        setPersona(datos);
        if (datos.nombre && !nombreTocado.current) setNombre(datos.nombre);
      })
      .catch(() => undefined);
    return () => control.abort();
  }, [rutValido]);

  async function registrar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    if (!rutValido) { setError("El RUT no es válido. Revise el dígito verificador."); return; }
    if (nombre.trim().length < 3) { setError("Falta el nombre."); return; }
    if (!servicio) { setError("Falta el servicio."); return; }
    setEnviando(true);
    try {
      const datos = await api<{ atencion: AtencionSinHora }>("/api/meson", { method: "POST", body: { rut: rutValido, nombre: nombre.trim(), servicioId: servicio, observacion }, idempotencyKey: clave });
      avisar(`${datos.atencion.numeroTexto} · ${datos.atencion.nombre} en espera.`);
      setRut(""); setNombre(""); setObservacion(""); setPersona(null); nombreTocado.current = false;
      setClave(crypto.randomUUID());
      onRegistrado(datos.atencion.id);
      inputRef.current?.focus();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo registrar.");
    } finally {
      setEnviando(false);
    }
  }

  const campo = "h-9 w-full rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-sky";
  return (
    <form onSubmit={registrar} className="superficie grid gap-2 p-3" aria-label="Registrar sin hora">
      <div className="grid gap-2 md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,14rem)] lg:grid-cols-[9.5rem_minmax(0,1.2fr)_14rem_minmax(0,1fr)_auto] lg:items-end">
        <label className="grid gap-1 text-xs font-semibold text-muted">RUT
          <input ref={inputRef} className={`${campo} tabular-nums ${rutCompleto && !rutValido ? "border-alert" : ""}`} value={rut} inputMode="text" autoComplete="off" placeholder="12.345.678-9" aria-invalid={rutCompleto && !rutValido} onChange={(e) => setRut(mascaraRut(e.target.value))} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">Nombre
          <input className={campo} value={nombre} autoComplete="off" onChange={(e) => { nombreTocado.current = true; setNombre(e.target.value); }} />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted">Servicio
          <select className={campo} value={servicio} onChange={(e) => setServicio(e.target.value)}>
            {servicios.length === 0 ? <option value="">Sin servicios</option> : null}
            {servicios.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-muted md:col-span-2 lg:col-span-1">Observación
          <input className={campo} value={observacion} maxLength={300} autoComplete="off" onChange={(e) => setObservacion(e.target.value)} />
        </label>
        <button type="submit" disabled={enviando} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-pine px-4 text-sm font-semibold text-white hover:bg-pine-dark disabled:opacity-60">
          <UserPlus size={15} aria-hidden /> {enviando ? "Registrando…" : "Registrar"}
        </button>
      </div>
      {error || (rutCompleto && !rutValido) || persona?.citaHoy || persona?.visitas ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {error ? <span role="alert" className="font-semibold text-alert">{error}</span> : rutCompleto && !rutValido ? <span role="alert" className="font-semibold text-alert">RUT no válido</span> : null}
          {persona?.citaHoy ? (
            <Link to={`/citas/${persona.citaHoy.id}`} className="rounded-full bg-[#e7eefc] px-2 py-0.5 font-semibold text-[#1e3a8a]">Cita hoy {persona.citaHoy.hora} · {persona.citaHoy.tramite}</Link>
          ) : null}
          {persona && persona.visitas > 0 ? <span className="rounded-full bg-paper px-2 py-0.5 text-muted">{persona.visitas} {persona.visitas === 1 ? "visita" : "visitas"}{persona.ultimaVisita ? ` · última ${textoFecha(persona.ultimaVisita)}` : ""}</span> : null}
        </div>
      ) : null}
    </form>
  );
}

function coincide(cita: Cita, estado: string, fecha: string, ahora: Date): boolean {
  if (!estado) return true;
  if (estado === "POR_LLEGAR") return cita.estado === "AGENDADA" && bloquePosterior(fecha, cita.hora, ahora);
  if (estado === "SIN_MARCAR") return cita.estado === "AGENDADA" && !bloquePosterior(fecha, cita.hora, ahora);
  if (estado === "EN_ESPERA") return (cita.estado === "ASISTIO" || cita.estado === "ATRASADO") && !cita.atencion_at;
  if (estado === "ATENDIDO") return Boolean(cita.atencion_at);
  return cita.estado === estado;
}

function etiquetaCita(cita: Cita, fecha: string, ahora: Date): { texto: string; tono: string; fila: string } {
  if (cita.atencion_at) return { texto: "Atendido", tono: "bg-[#e5f6ec] text-[#146c43]", fila: "text-muted" };
  if (cita.estado === "AGENDADA" && !bloquePosterior(fecha, cita.hora, ahora)) return { texto: "Sin marcar", tono: "bg-[#fbe9e7] text-alert", fila: "" };
  if (cita.estado === "AGENDADA") return { texto: "Por llegar", tono: "bg-[#eef1f5] text-[#41536b]", fila: "" };
  if (cita.estado === "ASISTIO") return { texto: "En espera", tono: "bg-[#fff1dc] text-[#9a5b00]", fila: "bg-[#fffbf3]" };
  if (cita.estado === "ATRASADO") return { texto: "Atrasado", tono: "bg-[#ffe7c2] text-[#8a4b00]", fila: "bg-[#fffbf3]" };
  if (cita.estado === "NO_ASISTIO") return { texto: "No asistió", tono: "bg-[#eef1f5] text-[#586a80]", fila: "text-muted" };
  return { texto: cita.estado, tono: "bg-paper", fila: "" };
}
