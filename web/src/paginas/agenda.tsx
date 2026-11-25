import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api, fechaHoy, fechaHumana } from "../api";
import { Fecha, grillaLaborable } from "../fecha";
import { useAuth } from "../auth";
import { Aviso, Esqueleto, Estado, Vacio, avisar } from "../ui";
import { useVivo } from "../vivo";

interface Bloque {
  hora: string;
  capacidad: number;
  usados: number;
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
  capacidad: number;
  usados: number;
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
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
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
        }>(`/api/agendas/${agendaId}/disponibilidad?mes=${fecha.slice(0, 7)}`);
        if (!activo) return;
        const habiles = disponibilidad.laborables;
        setLaborables(habiles);
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
  const elegida = citas.find((c) => c.id === seleccionada);
  const hayFiltro = Boolean(consulta.trim() || estado);
  const filtradas = citas.filter(
    (c) =>
      (!estado || c.estado === estado) &&
      `${c.nombre} ${c.tramite} ${c.hora}`
        .toLocaleLowerCase()
        .includes(consulta.trim().toLocaleLowerCase()),
  );
  const grilla = grillaLaborable(fecha.slice(0, 7), laborables);
  const horas = [
    ...new Set(dias.flatMap((d) => d.bloques.map((b) => b.hora))),
  ].sort();
  const vuelta = encodeURIComponent(
    `/agenda/${agenda}?fecha=${fecha}&vista=${vista}`,
  );
  const nueva = (hora = "") =>
    `/citas/nueva?agenda=${agenda}&fecha=${fecha}&hora=${hora}&volver=${vuelta}`;

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{titulo}</h1>
          <p className="mt-1 text-sm text-muted">{fechaHumana(fecha)}</p>
        </div>
        {puedeReservar ? (
          <Link className="btn bg-sky text-white" to={nueva()}>
            + Nueva cita
          </Link>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
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
          <div
            className="grid gap-1"
            style={{
              gridTemplateColumns: `repeat(${grilla.etiquetas.length || 1}, minmax(0,1fr))`,
            }}
          >
            {grilla.etiquetas.map((t) => (
              <span key={t} className="py-2 text-center text-xs text-muted">
                {t}
              </span>
            ))}
            {grilla.celdas.map((f, i) => {
              if (!f) return <span key={`v${i}`} />;
              const dia = mes.find((d) => d.fecha === f);
              const libres = Math.max(
                0,
                (dia?.capacidad ?? 0) - (dia?.usados ?? 0),
              );
              return (
                <button
                  key={f}
                  className={`min-h-20 rounded-lg border p-2 text-left ${f === fechaHoy() ? "border-sky bg-[#eef3ff]" : "border-line bg-white"}`}
                  onClick={() => navegar(f, "dia")}
                >
                  <span className="font-medium">{Number(f.slice(8))}</span>
                  <span className="mt-2 block text-xs text-muted">
                    {dia?.capacidad ? `${libres} libres` : "Sin bloques"}
                  </span>
                </button>
              );
            })}
          </div>
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
                    <th className="p-3" key={d.fecha}>
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
                    <th scope="row" className="p-3 font-medium">{h}</th>
                    {dias.map((d) => {
                      const b = d.bloques.find((b) => b.hora === h);
                      const personas = d.citas.filter((c) => c.hora === h);
                      return (
                        <td key={d.fecha} className="p-1 align-top">
                          {b ? (
                            <button
                              type="button"
                              className="min-h-16 w-full rounded-lg bg-[#edf2fd] p-2 text-left"
                              onClick={() => navegar(d.fecha, "dia")}
                            >
                              <span className="block text-xs">
                                {personas.map((c) => c.nombre).join(" · ") ||
                                  "Sin citas"}
                              </span>
                              <span className="mt-2 block text-xs text-muted">
                                {Math.max(0, b.capacidad - b.usados)} libres
                              </span>
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
            <label className="min-w-0 flex-1">
              <span className="sr-only">Buscar en el día</span>
              <input
                className={`${control} w-full`}
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
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_19rem]">
              <div className="superficie min-w-0 overflow-hidden">
                <div className="flex flex-wrap justify-between gap-2 border-b border-line px-4 py-3 text-sm">
                  <h2 className="font-semibold">Jornada del día</h2>
                  <span className="text-muted" aria-live="polite">
                    {citas.length} citas ·{" "}
                    {bloques.reduce(
                      (n, b) => n + Math.max(0, b.capacidad - b.usados),
                      0,
                    )}{" "}
                    cupos de bloque libres
                  </span>
                </div>
                {hayFiltro && !filtradas.length ? (
                  <div className="p-5">
                    <Vacio texto="No hay citas con ese filtro" />
                  </div>
                ) : null}
                {bloques.map((b) => {
                  const libres = Math.max(0, b.capacidad - b.usados);
                  const personas = filtradas.filter((c) => c.hora === b.hora);
                  if (hayFiltro && !personas.length) return null;
                  return (
                    <div
                      key={b.hora}
                      className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2 border-b border-line p-3 last:border-b-0"
                    >
                      <div className="pt-2 text-sm font-medium tabular-nums">
                        {b.hora}
                      </div>
                      <div className="min-w-0">
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                          {personas.map((c) => (
                            <button
                              type="button"
                              key={c.id}
                              aria-pressed={c.id === seleccionada}
                              onClick={() => {
                                setSeleccionada(c.id);
                                requestAnimationFrame(() =>
                                  panel.current?.focus(),
                                );
                              }}
                              className={`min-w-0 rounded-lg border p-3 text-left ${c.id === seleccionada ? "border-sky bg-[#edf2fd] ring-1 ring-sky" : "border-line bg-white hover:border-sky"}`}
                            >
                              <span className="block break-words text-sm font-semibold">
                                {c.nombre}
                              </span>
                              <span className="my-1.5 block text-xs text-muted">
                                {c.tramite}
                              </span>
                              <Estado valor={c.estado} />
                            </button>
                          ))}
                          {puedeReservar &&
                          libres > 0 &&
                          fecha >= fechaHoy() &&
                          !hayFiltro ? (
                            <Link
                              aria-label={`Reservar ${b.hora}`}
                              className="flex min-h-16 items-center justify-center rounded-lg border border-dashed border-[#b9c7e7] bg-[#f5f7fc] px-3 py-3 text-sm font-medium text-sky hover:bg-[#edf2fd]"
                              to={nueva(b.hora)}
                            >
                              + Reservar · {libres}{" "}
                              {libres === 1 ? "cupo" : "cupos"}
                            </Link>
                          ) : null}
                        </div>
                        <p className="mt-2 text-xs text-muted">
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
                className="superficie order-first p-5 xl:sticky xl:top-28 xl:order-last"
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
                          {elegida.docs_cargados ?? 0} de{" "}
                          {elegida.docs_requeridos ?? 0} cargados
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
                      {puedeReservar &&
                      elegida.estado === "AGENDADA" &&
                      fecha >= fechaHoy() ? (
                        <label className="grid gap-1 text-sm">
                          Mover a otro bloque del día
                          <select
                            className={`${control} w-full`}
                            disabled={guardando}
                            value=""
                            onChange={(e) =>
                              void actuar(elegida, "reagendar", {
                                fecha,
                                hora: e.target.value,
                              })
                            }
                          >
                            <option value="">Elegir horario…</option>
                            {bloques
                              .filter(
                                (b) =>
                                  b.hora !== elegida.hora &&
                                  b.usados < b.capacidad,
                              )
                              .map((b) => (
                                <option key={b.hora} value={b.hora}>
                                  {b.hora} · {b.capacidad - b.usados} libres
                                </option>
                              ))}
                          </select>
                        </label>
                      ) : null}
                      <Link
                        className="btn border border-line bg-white"
                        to={`/citas/${elegida.id}`}
                      >
                        Abrir ficha y documentos
                      </Link>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold">
                      Detalle de la cita
                    </h2>
                    <p className="mt-2 text-sm text-muted">
                      Seleccione una persona para ver su ficha y gestionar la
                      atención sin salir de la agenda.
                    </p>
                  </>
                )}
              </aside>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
