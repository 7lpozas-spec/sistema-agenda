import { CalendarDays, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { etiquetaIntento } from "../../../src/domain/examen";
import { mascaraRut, normalizarRut } from "../../../src/domain/rut";
import { bloquePosterior } from "../../../src/domain/tiempo";
import { api, fechaHoy, fechaHumana } from "../api";
import { Fecha, diaSemanaIso, grillaLaborable } from "../fecha";
import { useAuth } from "../auth";
import { Ayuda, useAtajos } from "../atajos";
import { Aviso, Docs, Esqueleto, Estado, Vacio, avisar } from "../ui";
import { useVivo } from "../vivo";

interface Bloque {
  hora: string;
  capacidad: number;
  usados: number;
  reservable?: boolean;
}
interface Cita {
  id: string;
  hora: string;
  estado: string;
  nombre: string;
  rut: string;
  tramite: string;
  docs_cargados?: number;
  docs_requeridos?: number;
}
interface Dia {
  fecha: string;
  bloques: Bloque[];
  citas: Cita[];
}
interface DiaMes {
  fecha: string;
  capacidad?: number;
  usados?: number;
  libres?: number;
  ocupados?: number;
  atendidas?: number;
  feriado?: boolean;
}
function sumar(fecha: string, dias: number) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}
function lunes(fecha: string) {
  const n = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  return sumar(fecha, -(n === 0 ? 6 : n - 1));
}
const control = "min-h-11 rounded-lg border border-line bg-white px-3 text-sm";

export function Agenda() {
  const { agenda = "general" } = useParams();
  const [params, setParams] = useSearchParams();
  const { usuario } = useAuth();
  const vista = ["dia", "semana", "mes"].includes(params.get("vista") ?? "")
    ? params.get("vista")!
    : "dia";
  const propuesta = params.get("fecha") ?? "";
  const fecha =
    /^\d{4}-\d{2}-\d{2}$/.test(propuesta) &&
    !Number.isNaN(Date.parse(`${propuesta}T12:00:00Z`))
      ? propuesta
      : fechaHoy();
  function navegar(dia: string, modo = vista) {
    setParams({ fecha: dia, vista: modo });
  }
  const agendaId = agenda === "primera_vez" ? "PRIMERA_VEZ" : "GENERAL";
  const titulo =
    agendaId === "GENERAL" ? "Agenda general" : "Agenda primera vez";
  const puedeReservar =
    usuario?.rol === "ADMIN" || usuario?.rol === "OPERADOR_AGENDA";
  const [dias, setDias] = useState<Dia[]>([]);
  const [mes, setMes] = useState<DiaMes[]>([]);
  const [laborables, setLaborables] = useState([1, 2, 3, 4, 5, 6]);
  const [feriados, setFeriados] = useState<string[]>([]);
  const [solicitud, setSolicitud] = useState<{ cita: Cita; hora: string } | null>(null);
  const dialogo = useRef<HTMLDialogElement>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [pendientes, setPendientes] = useState<{
    ciudadanoId: string; rut: string; rutVisible?: string; nombres: string; apellidos: string; nombre: string;
    otorgamientoFecha: string; ultimoIntento: { id: string; fecha: string; hora: string; estado: string; resultado?: string | null } | null;
  }[]>([]);
  const [rutPendiente, setRutPendiente] = useState("");
  const [hallazgo, setHallazgo] = useState<{ nombre: string; rut: string; mensaje?: string; habilitado: boolean; activo?: { id: string; fecha: string; hora: string } } | null>(null);
  const [revision, setRevision] = useState(0);
  const [consulta, setConsulta] = useState("");
  const [estado, setEstado] = useState("");
  const [seleccionada, setSeleccionada] = useState("");
  const [guardando, setGuardando] = useState(false);
  const pendiente = useRef(false);
  const panel = useRef<HTMLElement>(null);
  const refrescar = useCallback(() => setRevision((n) => n + 1), []);
  useVivo(refrescar);
  useEffect(() => {
    window.addEventListener("focus", refrescar);
    return () => window.removeEventListener("focus", refrescar);
  }, [refrescar]);
  useEffect(() => {
    setSeleccionada("");
  }, [agendaId, fecha, vista]);
  useEffect(() => {
    let activo = true;
    document.title = `${titulo} · Licencias Recoleta`;
    setCargando(true);
    setError("");
    setDias([]);
    setMes([]);
    async function cargar() {
      try {
        // Read the working days first, including when opening a week directly.
        const disponibilidad = await api<{
          dias: DiaMes[];
          laborables: number[];
          feriados?: string[];
        }>(`/api/agendas/${agendaId}/disponibilidad?mes=${fecha.slice(0, 7)}`);
        if (!activo) return;
        const habiles = disponibilidad.laborables;
        setLaborables(habiles);
        setFeriados(disponibilidad.feriados ?? []);
        setMes(disponibilidad.dias);
        if (vista !== "mes") {
          const fechas =
            vista === "dia"
              ? [fecha]
              : habiles.map((n) => sumar(lunes(fecha), n - 1));
          const respuesta = await Promise.all(
            fechas.map(async (f) => ({
              fecha: f,
              ...(await api<{ bloques: Bloque[]; citas: Cita[] }>(
                `/api/agendas/${agendaId}/dia/${f}`,
              )),
            })),
          );
          if (activo) setDias(respuesta);
        }
        if (agendaId === "PRIMERA_VEZ") {
          const cola = await api<{ pendientes: typeof pendientes }>(`/api/examen/pendientes`);
          if (activo) setPendientes(cola.pendientes);
        } else if (activo) setPendientes([]);
      } catch (falla) {
        if (activo)
          setError(
            falla instanceof Error
              ? falla.message
              : "No se pudo cargar la agenda.",
          );
      } finally {
        if (activo) setCargando(false);
      }
    }
    void cargar();
    return () => {
      activo = false;
    };
  }, [agendaId, fecha, titulo, vista, revision]);

  async function actuar(
    cita: Cita,
    accion: "asistencia" | "reagendar",
    body: object,
  ) {
    if (pendiente.current) return;
    pendiente.current = true;
    setGuardando(true);
    try {
      await api(`/api/citas/${cita.id}/${accion}`, { method: "POST", body });
      avisar(
        accion === "asistencia"
          ? "Asistencia actualizada."
          : "Cita reagendada.",
      );
      refrescar();
    } catch (falla) {
      avisar(
        falla instanceof Error
          ? falla.message
          : "No se pudo guardar el cambio.",
        "error",
      );
    } finally {
      pendiente.current = false;
      setGuardando(false);
    }
  }
  const bloques = dias[0]?.bloques ?? [];
  const citas = dias[0]?.citas ?? [];
  const ahora = new Date();
  const fechaReserva = fecha < fechaHoy() ? fechaHoy() : fecha;
  const elegida = citas.find((c) => c.id === seleccionada);
  const hayFiltro = Boolean(consulta.trim() || estado);
  const filtradas = citas.filter(
    (c) =>
      (!estado || c.estado === estado) &&
      `${c.nombre} ${c.tramite} ${c.hora}`
        .toLocaleLowerCase()
        .includes(consulta.trim().toLocaleLowerCase()),
  );
  const horas = [
    ...new Set(dias.flatMap((d) => d.bloques.map((b) => b.hora))),
  ].sort();
  const vuelta = encodeURIComponent(
    `/agenda/${agenda}?fecha=${fecha}&vista=${vista}`,
  );
  const nueva = (hora = "", dia = fechaReserva, rut = "") =>
    `/citas/nueva?agenda=${agenda}&fecha=${dia}&hora=${hora}&volver=${vuelta}${rut ? `&rut=${encodeURIComponent(rut)}` : ""}`;
  const sePuedeReservar = (dia: string, bloque: Bloque) =>
    bloque.reservable ??
    (bloquePosterior(dia, bloque.hora, ahora) && bloque.usados < bloque.capacidad);
  function pedirMover(cita: Cita, hora: string) {
    if (!puedeReservar || cita.estado !== "AGENDADA" || cita.hora === hora) return;
    const destino = bloques.find((bloque) => bloque.hora === hora);
    if (!destino || !sePuedeReservar(fecha, destino)) return;
    setSolicitud({ cita, hora });
    dialogo.current?.showModal();
  }
  const ayudaAgenda = useMemo(() => [
    { tecla: "N", accion: "Nueva cita" },
    { tecla: "← →", accion: "Día" },
    { tecla: "H", accion: "Hoy" },
    { tecla: "?", accion: "Esta ayuda" },
  ], []);
  const atajosAgenda = useAtajos(useMemo(() => ({
    n: () => { if (puedeReservar) window.location.assign(nueva()); },
    N: () => { if (puedeReservar) window.location.assign(nueva()); },
    ArrowLeft: () => navegar(sumar(fecha, -1)),
    ArrowRight: () => navegar(sumar(fecha, 1)),
    h: () => navegar(fechaHoy(), "dia"),
    H: () => navegar(fechaHoy(), "dia"),
  }), [fecha, puedeReservar]), ayudaAgenda);

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">{titulo}</h1>
          <p className="mt-1 text-sm text-muted">{fechaHumana(fecha)}</p>
        </div>
        {puedeReservar ? (
          <Link className="btn bg-sky text-white" to={nueva()}>
            <Plus size={16} aria-hidden /> Nueva cita
          </Link>
        ) : null}
      </div>
      <div className="agenda-toolbar flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <Fecha
            id="fecha-agenda"
            etiqueta="Fecha"
            valor={fecha}
            alCambiar={(f) => navegar(f)}
          />
          <button
            type="button"
            className={control}
            onClick={() => navegar(fechaHoy(), "dia")}
          >
            Hoy
          </button>
        </div>
        <div
          className="flex gap-1 rounded-full border border-line bg-white p-1"
          role="group"
          aria-label="Vista del calendario"
        >
          {["dia", "semana", "mes"].map((v) => (
            <button
              type="button"
              key={v}
              aria-pressed={vista === v}
              className={`min-h-10 rounded-full px-4 text-sm ${vista === v ? "bg-pine text-white" : "text-muted"}`}
              onClick={() => navegar(fecha, v)}
            >
              {v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}
            </button>
          ))}
        </div>
      </div>
      {agendaId === "PRIMERA_VEZ" ? (
        <section className="superficie grid gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Pendientes de agendar examen</h2>
            <span className="text-xs font-semibold tabular-nums text-muted">{pendientes.length}</span>
          </div>
          {puedeReservar ? (
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const normalizado = normalizarRut(rutPendiente);
                if (!normalizado) {
                  setHallazgo({ nombre: "", rut: rutPendiente, habilitado: false, mensaje: "Revise el RUT y su dígito verificador." });
                  return;
                }
                void api<{
                  ciudadano: { nombres: string; apellidos: string; rut?: string } | null;
                  examen?: { habilitado: boolean; mensaje?: string; examenActivo?: { id: string; fecha: string; hora: string } };
                }>(`/api/ciudadanos?rut=${encodeURIComponent(normalizado)}`)
                  .then((datos) => {
                    const examen = datos.examen;
                    const nombre = datos.ciudadano ? `${datos.ciudadano.nombres} ${datos.ciudadano.apellidos}` : "";
                    if (examen?.habilitado && datos.ciudadano) {
                      setHallazgo({ nombre, rut: normalizado, habilitado: true });
                    } else if (examen?.examenActivo) {
                      setHallazgo({ nombre, rut: normalizado, habilitado: false, mensaje: examen.mensaje, activo: examen.examenActivo });
                    } else {
                      setHallazgo({ nombre, rut: normalizado, habilitado: false, mensaje: examen?.mensaje ?? "No está habilitado para el examen práctico." });
                    }
                  })
                  .catch((falla: unknown) => setHallazgo({ nombre: "", rut: rutPendiente, habilitado: false, mensaje: falla instanceof Error ? falla.message : "No se pudo consultar el RUT." }));
              }}
            >
              <label className="grid min-w-[12rem] flex-1 gap-1 text-sm font-medium" htmlFor="rut-examen">RUT
                <input id="rut-examen" className={control} value={rutPendiente} onChange={(e) => { setRutPendiente(mascaraRut(e.target.value)); setHallazgo(null); }} />
              </label>
              <button type="submit" className="btn border border-line bg-white">Buscar</button>
            </form>
          ) : null}
          {hallazgo?.mensaje ? <Aviso>{hallazgo.mensaje}</Aviso> : null}
          {hallazgo?.activo ? (
            <Link className="text-sm font-semibold text-sky underline" to={`/citas/${hallazgo.activo.id}`}>Examen práctico {hallazgo.activo.fecha} {hallazgo.activo.hora}</Link>
          ) : null}
          {hallazgo?.habilitado ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
              <span className="font-semibold">{hallazgo.nombre}</span>
              <Link className="btn bg-pine text-white" to={nueva("", fecha, hallazgo.rut)}>Agendar</Link>
            </div>
          ) : null}
          {pendientes.length === 0 ? (
            <p className="text-sm text-muted">Sin pendientes</p>
          ) : (
            <ul className="grid gap-1">
              {pendientes.map((fila) => (
                <li key={fila.ciudadanoId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{fila.nombre}</p>
                    <p className="text-xs text-muted tabular-nums">
                      {fila.rutVisible ?? fila.rut}
                      {fila.ultimoIntento ? ` · ${etiquetaIntento(fila.ultimoIntento)} ${fila.ultimoIntento.fecha}` : ` · ${fila.otorgamientoFecha}`}
                    </p>
                  </div>
                  {puedeReservar ? (
                    <Link className="btn bg-pine text-white" to={nueva("", fecha, fila.rut)}>Agendar</Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
      {error ? (
        <Aviso>
          {error}{" "}
          <button type="button" className="ml-2 underline" onClick={refrescar}>
            Reintentar
          </button>
        </Aviso>
      ) : null}
      {cargando ? <Esqueleto /> : null}
      {!cargando && !error && vista === "mes" ? (
        <div className="superficie p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <button
              className={control}
              aria-label="Mes anterior"
              onClick={() =>
                navegar(
                  sumar(fecha.slice(0, 7) + "-01", -1).slice(0, 7) + "-01",
                )
              }
            >
              ‹
            </button>
            <h2 className="font-semibold">
              {new Intl.DateTimeFormat("es-CL", {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }).format(new Date(`${fecha}T12:00:00Z`))}
            </h2>
            <button
              className={control}
              aria-label="Mes siguiente"
              onClick={() =>
                navegar(
                  sumar(fecha.slice(0, 7) + "-01", 32).slice(0, 7) + "-01",
                )
              }
            >
              ›
            </button>
          </div>
          <MesAgenda
            mes={fecha.slice(0, 7)}
            activo={fecha}
            dias={mes}
            laborables={laborables}
            feriados={feriados}
            onElegir={(f) => navegar(f, "dia")}
          />
        </div>
      ) : null}
      {!cargando && !error && vista === "semana" ? (
        horas.length ? (
          <div className="superficie overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">Agenda semanal</caption>
              <thead>
                <tr>
                  <th className="p-3">Hora</th>
                  {dias.map((d) => (
                    <th className={`p-3 ${d.fecha < fechaHoy() ? "agenda-week-past" : ""}`} key={d.fecha}>
                      {new Intl.DateTimeFormat("es-CL", {
                        weekday: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(`${d.fecha}T12:00:00Z`))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {horas.map((h) => (
                  <tr key={h} className="border-t border-line">
                    <th scope="row" className="p-3 font-medium">
                      {h}
                    </th>
                    {dias.map((d) => {
                      const b = d.bloques.find((b) => b.hora === h);
                      const personas = d.citas.filter((c) => c.hora === h);
                      const diaPasado = d.fecha < fechaHoy();
                      const horaPasada = b ? !bloquePosterior(d.fecha, b.hora, ahora) : false;
                      const libre = b && sePuedeReservar(d.fecha, b) ? Math.max(0, b.capacidad - b.usados) : 0;
                      return (
                        <td key={d.fecha} className={`p-1 align-top ${diaPasado ? "agenda-week-past" : ""}`}>
                          {b ? (
                            <button
                              type="button"
                              className={`min-h-16 w-full rounded-lg p-2 text-left ${diaPasado || horaPasada ? "bg-[#d9e1ea] text-[#4e5d6e]" : "bg-[#edf2fd]"}`}
                              onClick={() => navegar(d.fecha, "dia")}
                            >
                              {personas.length ? (
                                <span className="grid gap-0.5 text-xs">
                                  {personas.map((c) => (
                                    <span key={c.id} className="flex items-center gap-1">
                                      <span className="min-w-0 truncate">{c.nombre}</span>
                                      <Docs cargados={c.docs_cargados} requeridos={c.docs_requeridos} compacto />
                                    </span>
                                  ))}
                                </span>
                              ) : (
                                <span className="block text-xs">{diaPasado || horaPasada ? "—" : "Sin citas"}</span>
                              )}
                              {libre > 0 ? (
                                <span className="mt-2 block text-xs text-muted">
                                  {libre} libres
                                </span>
                              ) : null}
                            </button>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vacio texto="Sin bloques habilitados esta semana" />
        )
      ) : null}
      {vista === "dia" ? (
        <>
          <div className="flex flex-wrap gap-3">
            <label className="relative min-w-[180px] flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-3.5 text-muted"
                aria-hidden
              />
              <span className="sr-only">Buscar en el día</span>
              <input
                className={`${control} w-full pl-10`}
                placeholder="Buscar por nombre, trámite u hora…"
                value={consulta}
                onChange={(e) => setConsulta(e.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Filtrar estado</span>
              <select
                className={control}
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
              >
                <option value="">Todos los estados</option>
                <option value="AGENDADA">Agendadas</option>
                <option value="ASISTIO">Asistieron</option>
                <option value="ATRASADO">Atrasados</option>
                <option value="NO_ASISTIO">No asistieron</option>
              </select>
            </label>
          </div>
          {!cargando && !error && !bloques.length ? (
            <Vacio texto="Sin bloques habilitados para este día" />
          ) : null}
          {!cargando && !error && bloques.length > 0 ? (
            <div className="agenda-columns">
              <div className="superficie min-w-0 overflow-hidden">
                <div className="flex flex-wrap justify-between gap-2 border-b border-line px-4 py-3 text-sm">
                  <h2 className="flex items-center gap-2 font-semibold">
                    <CalendarDays size={16} className="text-sky" aria-hidden />{" "}
                    Jornada del día
                  </h2>
                  <span className="text-muted" aria-live="polite">
                    {citas.length} citas ·{" "}
                    {bloques.reduce(
                      (n, b) => n + (sePuedeReservar(fecha, b) ? Math.max(0, b.capacidad - b.usados) : 0),
                      0,
                    )}{" "}
                    cupos libres
                  </span>
                </div>
                {hayFiltro && !filtradas.length ? (
                  <div className="p-5">
                    <Vacio texto="No hay citas con ese filtro" />
                  </div>
                ) : null}
                {bloques.map((b) => {
                  const reservable = sePuedeReservar(fecha, b);
                  const libres = reservable ? Math.max(0, b.capacidad - b.usados) : 0;
                  const pasado = !bloquePosterior(fecha, b.hora, ahora);
                  const personas = filtradas.filter((c) => c.hora === b.hora);
                  if (hayFiltro && !personas.length) return null;
                  return (
                    <div
                      key={b.hora}
                      className={`agenda-row ${pasado ? "is-past" : ""} ${reservable ? "is-open" : ""}`}
                      onDragOver={(evento) => {
                        if (puedeReservar && reservable) evento.preventDefault();
                      }}
                      onDrop={(evento) => {
                        evento.preventDefault();
                        if (!puedeReservar || !reservable) return;
                        const id = evento.dataTransfer.getData("text/plain");
                        const cita = citas.find((item) => item.id === id);
                        if (cita) pedirMover(cita, b.hora);
                      }}
                    >
                      <div className="agenda-time">
                        <span>{b.hora}</span>
                        <small>
                          {b.usados}/{b.capacidad}
                        </small>
                      </div>
                      <div className="min-w-0">
                        <div className="agenda-slots">
                          {personas.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              draggable={puedeReservar && c.estado === "AGENDADA"}
                              aria-pressed={c.id === seleccionada}
                              className={`appointment ${puedeReservar && c.estado === "AGENDADA" ? "cursor-grab" : ""}`}
                              onDragStart={(evento) => {
                                if (!puedeReservar || c.estado !== "AGENDADA") {
                                  evento.preventDefault();
                                  return;
                                }
                                evento.dataTransfer.setData("text/plain", c.id);
                                evento.dataTransfer.effectAllowed = "move";
                              }}
                              onClick={() => {
                                setSeleccionada(c.id);
                                requestAnimationFrame(() =>
                                  panel.current?.focus(),
                                );
                              }}
                              data-state={c.estado}
                            >
                              <span className="appointment-top">
                                <span className="appointment-name">
                                  {c.nombre}
                                </span>
                                <Estado valor={c.estado} />
                              </span>
                              <span className="appointment-type flex items-center gap-2">
                                <span className="min-w-0 truncate">{c.tramite}</span>
                                <Docs cargados={c.docs_cargados} requeridos={c.docs_requeridos} />
                              </span>
                            </button>
                          ))}
                          {puedeReservar && reservable && !hayFiltro ? (
                            <Link
                              aria-label={`Reservar ${b.hora}`}
                              className="slot-reserve"
                              to={nueva(b.hora)}
                            >
                              <span className="flex items-center gap-1">
                                <Plus size={14} aria-hidden /> Reservar
                              </span>
                              <small>
                                {libres}{" "}
                                {libres === 1 ? "cupo libre" : "cupos libres"}
                              </small>
                            </Link>
                          ) : null}
                        </div>
                        <p className="sr-only">
                          {b.usados} de {b.capacidad} ocupados ·{" "}
                          {libres ? `${libres} disponibles` : "Completo"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <aside
                ref={panel}
                tabIndex={-1}
                aria-label="Detalle de la cita"
                className="superficie detail-panel"
                data-selected={Boolean(elegida)}
              >
                {elegida ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium uppercase tracking-wider text-muted">
                        Detalle de la cita
                      </span>
                      <button
                        type="button"
                        className="min-h-10 min-w-10 rounded"
                        aria-label="Cerrar ficha"
                        onClick={() => setSeleccionada("")}
                      >
                        ×
                      </button>
                    </div>
                    <div className="detail-avatar" aria-hidden>
                      {elegida.nombre
                        .split(",")
                        .reverse()
                        .map((n) => n.trim()[0])
                        .join("")}
                    </div>
                    <h2 className="mt-3 break-words text-xl font-semibold">
                      {elegida.nombre}
                    </h2>
                    <p className="mb-3 mt-1 text-sm text-muted">
                      {elegida.rut}
                    </p>
                    <Estado valor={elegida.estado} />
                    <dl className="my-5 grid gap-3 text-sm">
                      <div>
                        <dt className="text-muted">Horario</dt>
                        <dd>{elegida.hora} h</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Trámite</dt>
                        <dd>{elegida.tramite}</dd>
                      </div>
                      <div>
                        <dt className="text-muted">Documentos</dt>
                        <dd>
                          {(elegida.docs_requeridos ?? 0) > 0 ? <Docs cargados={elegida.docs_cargados} requeridos={elegida.docs_requeridos} /> : null}
                        </dd>
                      </div>
                    </dl>
                    <div className="grid gap-2">
                      {elegida.estado === "AGENDADA" && fecha === fechaHoy() ? (
                        <button
                          type="button"
                          disabled={guardando}
                          className="btn bg-sky text-white"
                          onClick={() =>
                            void actuar(elegida, "asistencia", {
                              estado: "ASISTIO",
                            })
                          }
                        >
                          {guardando ? "Guardando…" : "Marcar llegada"}
                        </button>
                      ) : null}
                      {puedeReservar && elegida.estado === "AGENDADA" ? (
                        <MoverCita
                          bloques={bloques.filter((b) => b.hora !== elegida.hora && sePuedeReservar(fecha, b))}
                          guardando={guardando}
                          onMover={(hora) => void actuar(elegida, "reagendar", { fecha, hora })}
                        />
                      ) : null}
                      <Link
                        className={(elegida.docs_cargados ?? 0) < (elegida.docs_requeridos ?? 0) ? "btn bg-pine text-white" : "btn border border-line bg-white"}
                        to={`/citas/${elegida.id}`}
                      >
                        {(elegida.docs_cargados ?? 0) < (elegida.docs_requeridos ?? 0) ? "Fotografiar documentos" : "Abrir ficha"}
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold">Detalle de la cita</h2>
                  </>
                )}
              </aside>
            </div>
          ) : null}
          <dialog
            ref={dialogo}
            className="w-[min(24rem,calc(100%-2rem))] rounded-2xl border border-line bg-white p-5 text-ink shadow-2xl"
            onClose={() => setSolicitud(null)}
          >
            <form
              method="dialog"
              className="grid gap-4"
              onSubmit={(evento) => {
                evento.preventDefault();
                const pendiente = solicitud;
                dialogo.current?.close();
                if (!pendiente) return;
                void actuar(pendiente.cita, "reagendar", { fecha, hora: pendiente.hora });
              }}
            >
              <h2 className="text-lg font-semibold">Mover cita</h2>
              <p>
                {solicitud ? `${solicitud.cita.nombre} a las ${solicitud.hora}.` : ""}
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" className="btn border border-line bg-white" onClick={() => dialogo.current?.close()}>
                  Cancelar
                </button>
                <button type="submit" className="btn bg-sky text-white">
                  Confirmar
                </button>
              </div>
            </form>
          </dialog>
        </>
      ) : null}
      <Ayuda abierta={atajosAgenda.abierta} ayuda={ayudaAgenda} onCerrar={atajosAgenda.cerrar} />
    </section>
  );
}

function MesAgenda({
  mes,
  activo,
  dias,
  laborables,
  feriados,
  onElegir,
}: {
  mes: string;
  activo: string;
  dias: DiaMes[];
  laborables: number[];
  feriados: string[];
  onElegir: (fecha: string) => void;
}) {
  const hoy = fechaHoy();
  const grilla = grillaLaborable(mes, [1, 2, 3, 4, 5, 6, 7]);
  const mapa = new Map(dias.map((dia) => [dia.fecha, dia]));
  return (
    <div
      className="grid gap-1"
      style={{ gridTemplateColumns: `repeat(${grilla.etiquetas.length || 1}, minmax(0,1fr))` }}
    >
      {grilla.etiquetas.map((t) => (
        <span key={t} className="py-2 text-center text-xs text-muted">
          {t}
        </span>
      ))}
      {grilla.celdas.map((f, i) => {
        if (!f) return <span key={`v${i}`} />;
        return (
          <CeldaMes
            key={f}
            fecha={f}
            hoy={hoy}
            activo={activo === f}
            dia={mapa.get(f)}
            laboral={laborables.includes(diaSemanaIso(f))}
            feriado={feriados.includes(f) || Boolean(mapa.get(f)?.feriado)}
            onElegir={onElegir}
          />
        );
      })}
    </div>
  );
}

function MoverCita({
  bloques,
  guardando,
  onMover,
}: {
  bloques: Bloque[];
  guardando: boolean;
  onMover: (hora: string) => void;
}) {
  if (bloques.length === 0) return null;
  return (
    <label className="grid gap-1 text-sm">
      Mover a otro bloque del día
      <select
        className={`${control} w-full`}
        disabled={guardando}
        value=""
        onChange={(e) => onMover(e.target.value)}
      >
        <option value="">Elegir horario…</option>
        {bloques.map((b) => (
          <option key={b.hora} value={b.hora}>
            {b.hora} · {b.capacidad - b.usados} libres
          </option>
        ))}
      </select>
    </label>
  );
}

function CeldaMes({
  fecha,
  hoy,
  activo,
  dia,
  laboral,
  feriado,
  onElegir,
}: {
  fecha: string;
  hoy: string;
  activo: boolean;
  dia?: DiaMes;
  laboral: boolean;
  feriado: boolean;
  onElegir: (fecha: string) => void;
}) {
  const pasado = fecha < hoy;
  const libres = dia?.libres ?? 0;
  const ocupacion = (dia?.atendidas ?? 0) > 0 ? dia?.atendidas ?? 0 : dia?.ocupados ?? 0;
  const clase = feriado
    ? "cal-feriado"
    : !laboral
      ? "cal-cerrado"
      : pasado
        ? "cal-pasado"
        : libres > 0
          ? "cal-libre"
          : "cal-vacio";
  const detalle = feriado
    ? "Feriado"
    : !laboral
      ? "—"
      : pasado
        ? String(ocupacion)
        : `${libres} libres`;
  return (
    <button
      type="button"
      className={`cal-dia ${clase} ${activo ? "is-active" : ""} ${fecha === hoy ? "is-today" : ""}`}
      onClick={() => onElegir(fecha)}
    >
      <span className="font-medium">{Number(fecha.slice(8))}</span>
      <span className="cal-meta">{detalle}</span>
    </button>
  );
}
