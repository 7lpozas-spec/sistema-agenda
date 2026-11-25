import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fechaHoy } from "../api";
import { Fecha, diaSemanaIso, grillaLaborable, textoFecha } from "../fecha";
import { Aviso, Docs, Esqueleto } from "../ui";
import { useVivo } from "../vivo";

interface Hueco { fecha: string; hora: string; libres: number }
interface DiaMes { agenda: string; fecha: string; libres: number; ocupados?: number; atendidas?: number; feriado?: boolean }
interface Kpis {
  total: number; asistieron: number; noAsistieron: number; atrasados: number; canceladas: number; tasa: number | null;
  anterior: { total: number; asistieron: number; noAsistieron: number; atrasados: number; canceladas: number; tasa: number | null };
}
interface Actividad {
  nombre: string; rol: string; agenda: string;
  creadas: number; reagendadas: number; canceladas: number; asistencias: number;
  anterior: { creadas: number; reagendadas: number; canceladas: number; asistencias: number };
}
interface Panel {
  vista: "admin" | "operador" | "instructor" | "recepcion";
  puedeAgendar: boolean;
  exportar: boolean;
  hoy: { fecha: string; citados: number; llegaron: number; faltan: number; inasistencias: number; aTiempo: number; atrasados: number; proxima: { id: string; hora: string; nombre: string; tramite: string; docsCargados: number; docsRequeridos: number } | null; docsPendientes: number };
  periodo: { citados: number; llegaron: number; aTiempo: number; atrasados: number; inasistencias: number; esperaMin: number | null; anterior: { citados: number; llegaron: number; aTiempo: number; atrasados: number; inasistencias: number } };
  flujo: { hora: string; citados: number; llegaron: number }[];
  proximosDias: { fecha: string; citados: number }[];
  huecos: { agenda: string; proxima: Hueco | null; siguientes: Hueco[] }[];
  kpis: Kpis | null;
  kpisPorAgenda: { agenda: string; total: number; asistieron: number; noAsistieron: number; atrasados: number }[];
  mes: { dias: DiaMes[]; feriados: string[]; laborables: number[] };
  actividad: { filas: Actividad[]; recientes: { at: string; quien: string; accion: string; persona: string; agenda: string; fecha: string; hora: string }[] };
  relevantes: { inasistencias: { nombre: string; n: number }[]; repetidas: { nombre: string; n: number }[]; tramites: { nombre: string; citas: number }[]; ocupacion: { hora: string; citas: number }[] };
}

interface ResumenMeson {
  total: number; enEspera: number; enAtencion: number; atendidos: number; seRetiraron: number; esperaMin: number | null; esperaMaxMin: number | null;
  porServicio: { servicio: string; n: number }[]; porHora: { hora: string; n: number }[]; porUsuario: { nombre: string; registradas: number; atendidas: number }[];
}
type PanelConMeson = Panel & { meson: { hoy: ResumenMeson; periodo: ResumenMeson } | null };

export function Inicio() {
  const hoy = fechaHoy();
  const [desde, setDesde] = useState(() => sumar(hoy, -21));
  const [hasta, setHasta] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [panel, setPanel] = useState<PanelConMeson | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(() => {
    const params = new URLSearchParams({ desde, hasta, mes });
    void api<PanelConMeson>(`/api/panel?${params}`)
      .then((datos) => { setPanel(datos); setError(""); })
      .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo cargar."));
  }, [desde, hasta, mes]);

  useEffect(() => {
    document.title = "Dashboard · Licencias Recoleta";
    cargar();
  }, [cargar]);
  useVivo(useCallback(() => cargar(), [cargar]));

  if (!panel && !error) return <Esqueleto />;
  const vista = panel?.vista ?? "operador";
  const exportAgenda = vista === "instructor" ? "PRIMERA_VEZ" : vista === "operador" ? "GENERAL" : "";
  const qs = new URLSearchParams({ desde, hasta });
  if (exportAgenda) qs.set("agenda", exportAgenda);

  return (
    <section className="grid gap-3">
      <header className="flex flex-wrap items-end gap-3">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">Dashboard</h1>
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); cargar(); }}>
          <div className="w-36"><Fecha id="dash-desde" etiqueta="Desde" valor={desde} alCambiar={setDesde} laborables={panel?.mes.laborables} /></div>
          <div className="w-36"><Fecha id="dash-hasta" etiqueta="Hasta" valor={hasta} alCambiar={setHasta} laborables={panel?.mes.laborables} /></div>
          <button className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-medium hover:bg-paper" type="submit">Filtrar</button>
        </form>
        {panel?.exportar || vista === "admin" ? (
          <div className="flex gap-1.5">
            {panel?.exportar ? (
              <>
                <a className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-medium leading-10 hover:bg-paper" href={`/api/export/estadisticas.csv?${qs}`} aria-label="Descargar CSV">CSV</a>
                <a className="h-10 rounded-lg bg-pine px-3 text-sm font-semibold leading-10 text-white" href={`/api/export/estadisticas.xlsx?${qs}`} aria-label="Descargar Excel">Excel</a>
                <a className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-medium leading-10 hover:bg-paper" href={`/api/export/reporte-diario.pdf?fecha=${hoy}${exportAgenda ? `&agenda=${exportAgenda}` : ""}`} aria-label="Descargar PDF">PDF</a>
              </>
            ) : null}
            {vista === "admin" ? <a className="h-10 rounded-lg border border-line bg-white px-3 text-sm font-medium leading-10 hover:bg-paper" href={`/api/export/meson.csv?${new URLSearchParams({ desde, hasta })}`} aria-label="Descargar mesón CSV">Mesón CSV</a> : null}
          </div>
        ) : null}
      </header>
      {error ? <Aviso>{error}</Aviso> : null}
      {panel && vista === "recepcion" ? <Recepcion panel={panel} /> : null}
      {panel && vista === "instructor" ? <Instructor panel={panel} /> : null}
      {panel && (vista === "operador" || vista === "admin") ? <Oficina panel={panel} /> : null}
      {panel?.kpis ? <KpiFila kpis={panel.kpis} docs={panel.hoy.docsPendientes} destino={vista === "admin" ? "/atencion" : vista === "instructor" ? "/agenda/primera_vez" : "/agenda/general"} /> : null}
      {panel && vista === "admin" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          {panel.kpisPorAgenda.map((fila) => (
            <article key={fila.agenda} className="superficie flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5">
              <p className="text-sm font-semibold">{fila.agenda === "PRIMERA_VEZ" ? "Primera vez" : "General"}</p>
              <p className="text-sm tabular-nums text-muted"><b className="text-ink">{fila.total}</b> citas · <b className="text-ink">{fila.asistieron}</b> asistencias · <b className="text-ink">{fila.noAsistieron}</b> inasistencias · <b className="text-ink">{fila.atrasados}</b> atrasos</p>
            </article>
          ))}
        </div>
      ) : null}
      {panel?.meson && vista === "admin" ? <MesonPeriodo meson={panel.meson.periodo} /> : null}
      {panel && vista !== "recepcion" ? (
        <div className={`grid gap-3 ${vista === "admin" ? "xl:grid-cols-2" : ""}`}>
          {(vista === "admin" ? ["GENERAL", "PRIMERA_VEZ"] : [vista === "instructor" ? "PRIMERA_VEZ" : "GENERAL"]).map((agenda) => (
            <Calendario
              key={agenda}
              nombre={agenda === "PRIMERA_VEZ" ? "Primera vez" : "General"}
              mes={mes}
              dias={panel.mes.dias.filter((dia) => dia.agenda === agenda)}
              laborables={panel.mes.laborables}
              feriados={panel.mes.feriados}
              onMes={(delta) => setMes(moverMes(mes, delta))}
            />
          ))}
        </div>
      ) : null}
      {panel && vista !== "recepcion" ? <Actividad panel={panel} /> : null}
      {panel && vista !== "recepcion" ? <Relevantes panel={panel} /> : null}
    </section>
  );
}

function Oficina({ panel }: { panel: Panel }) {
  const general = panel.huecos.find((fila) => fila.agenda === "GENERAL");
  const primera = panel.huecos.find((fila) => fila.agenda === "PRIMERA_VEZ");
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {general ? <Tarjeta agenda="general" nombre="Agenda general" hueco={general} puedeAgendar={panel.puedeAgendar} /> : null}
      {primera ? <Tarjeta agenda="primera_vez" nombre="Primera vez" hueco={primera} puedeAgendar={panel.puedeAgendar} /> : null}
    </div>
  );
}

function Instructor({ panel }: { panel: Panel }) {
  const hueco = panel.huecos[0];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <article className="superficie flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Siguiente hoy</p>
          {panel.hoy.proxima ? (
            <Link className="flex items-baseline gap-3" to={`/citas/${panel.hoy.proxima.id}`}>
              <span className="text-2xl font-semibold tabular-nums">{panel.hoy.proxima.hora}</span>
              <span className="truncate font-semibold">{panel.hoy.proxima.nombre}</span>
            </Link>
          ) : <p className="text-sm text-muted">Sin pendientes</p>}
          {panel.hoy.proxima ? <p className="flex items-center gap-2 truncate text-xs text-muted">{panel.hoy.proxima.tramite}<Docs cargados={panel.hoy.proxima.docsCargados} requeridos={panel.hoy.proxima.docsRequeridos} /></p> : null}
        </div>
        <div className="ml-auto flex gap-4 text-center tabular-nums">
          <Cifra etiqueta="Pendientes" valor={panel.hoy.faltan} />
          <Cifra etiqueta="Docs" valor={panel.hoy.docsPendientes} />
          <Cifra etiqueta="Llegaron" valor={panel.hoy.llegaron} />
          <Cifra etiqueta="Inasistencias" valor={panel.hoy.inasistencias} />
        </div>
        <Link className="btn border border-line bg-white" to="/agenda/primera_vez">Abrir día</Link>
      </article>
      {hueco ? <Tarjeta agenda="primera_vez" nombre="Próximo cupo" hueco={hueco} puedeAgendar={false} /> : null}
    </div>
  );
}

function Cifra({ etiqueta, valor }: { etiqueta: string; valor: number | string }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      <p className="text-[11px] text-muted">{etiqueta}</p>
    </div>
  );
}

function Recepcion({ panel }: { panel: PanelConMeson }) {
  const meson = panel.meson?.hoy;
  const periodoMeson = panel.meson?.periodo;
  const porHoraSinHora = new Map((meson?.porHora ?? []).map((fila) => [fila.hora.slice(0, 2), fila.n]));
  const horas = [...new Set([...panel.flujo.map((fila) => fila.hora.slice(0, 2)), ...porHoraSinHora.keys()])].sort();
  const porHora = horas.map((h) => {
    const citas = panel.flujo.filter((fila) => fila.hora.slice(0, 2) === h);
    return { hora: `${h}:00`, citados: citas.reduce((a, f) => a + f.citados, 0), llegaron: citas.reduce((a, f) => a + f.llegaron, 0), sinHora: porHoraSinHora.get(h) ?? 0 };
  });
  const maximo = Math.max(1, ...porHora.map((fila) => fila.citados + fila.sinHora));
  return (
    <div className="grid gap-3">
      <div className="superficie grid grid-cols-2 divide-line sm:grid-cols-4 sm:divide-x lg:grid-cols-8">
        <Kpi etiqueta="Citados" valor={panel.hoy.citados} />
        <Kpi etiqueta="Llegaron" valor={panel.hoy.llegaron} />
        <Kpi etiqueta="Docs pendientes" valor={panel.hoy.docsPendientes} tono={panel.hoy.docsPendientes > 0 ? "aviso" : undefined} />
        <Kpi etiqueta="Atrasos" valor={panel.hoy.atrasados} />
        <Kpi etiqueta="Inasistencias" valor={panel.hoy.inasistencias} />
        <Kpi etiqueta="Pendientes" valor={Math.max(0, panel.hoy.faltan)} />
        <Kpi etiqueta="Sin hora" valor={meson?.total ?? 0} detalle={meson && meson.esperaMin !== null ? `${meson.esperaMin} min prom.` : undefined} />
        <Kpi etiqueta="En espera" valor={(meson?.enEspera ?? 0) + (meson?.enAtencion ?? 0)} tono={(meson?.enEspera ?? 0) > 0 ? "aviso" : undefined} />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <article className="superficie p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Hoy por hora</h2>
            <p className="flex gap-3 text-[11px] text-muted"><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-sky" />Llegaron</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#c7d5f6]" />Citados</span><span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm bg-[#f0b45a]" />Sin hora</span></p>
          </div>
          {porHora.length === 0 ? <p className="py-4 text-sm text-muted">Sin datos</p> : (
            <ul className="grid gap-1">
              {porHora.map((fila) => (
                <li key={fila.hora} className="grid grid-cols-[3rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-xs">
                  <span className="tabular-nums text-muted">{fila.hora}</span>
                  <span className="flex h-3 overflow-hidden rounded bg-paper">
                    <span className="relative h-full bg-[#c7d5f6]" style={{ width: `${(fila.citados / maximo) * 100}%` }}>
                      <span className="absolute inset-y-0 left-0 bg-sky" style={{ width: fila.citados ? `${(fila.llegaron / fila.citados) * 100}%` : 0 }} />
                    </span>
                    <span className="h-full bg-[#f0b45a]" style={{ width: `${(fila.sinHora / maximo) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums">{fila.llegaron}/{fila.citados}{fila.sinHora ? ` +${fila.sinHora}` : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </article>
        <article className="superficie p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Sin hora hoy</h2>
            <Link className="text-xs font-semibold text-sky" to="/atencion?vista=sin-hora">Abrir</Link>
          </div>
          <div className="mb-2 grid grid-cols-4 gap-2 text-center">
            <Cifra etiqueta="Espera" valor={meson?.enEspera ?? 0} />
            <Cifra etiqueta="Atención" valor={meson?.enAtencion ?? 0} />
            <Cifra etiqueta="Atendidos" valor={meson?.atendidos ?? 0} />
            <Cifra etiqueta="Se retiró" valor={meson?.seRetiraron ?? 0} />
          </div>
          <Barras filas={(meson?.porServicio ?? []).map((f) => [f.servicio, f.n])} />
        </article>
        <article className="superficie p-3">
          <h2 className="mb-2 text-sm font-semibold">Período</h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted">Llegaron</dt><dd className="text-right tabular-nums">{panel.periodo.llegaron} <Delta actual={panel.periodo.llegaron} antes={panel.periodo.anterior.llegaron} /></dd>
            <dt className="text-muted">Atrasos</dt><dd className="text-right tabular-nums">{panel.periodo.atrasados} <Delta actual={panel.periodo.atrasados} antes={panel.periodo.anterior.atrasados} subeEsBueno={false} /></dd>
            <dt className="text-muted">Inasistencias</dt><dd className="text-right tabular-nums">{panel.periodo.inasistencias} <Delta actual={panel.periodo.inasistencias} antes={panel.periodo.anterior.inasistencias} subeEsBueno={false} /></dd>
            <dt className="text-muted">Espera con hora</dt><dd className="text-right tabular-nums">{panel.periodo.esperaMin !== null ? `${panel.periodo.esperaMin} min` : "—"}</dd>
            <dt className="text-muted">Sin hora</dt><dd className="text-right tabular-nums">{periodoMeson?.total ?? 0}</dd>
            <dt className="text-muted">Espera sin hora</dt><dd className="text-right tabular-nums">{periodoMeson?.esperaMin !== null && periodoMeson?.esperaMin !== undefined ? `${periodoMeson.esperaMin} min` : "—"}</dd>
          </dl>
          <h3 className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">Próximos días</h3>
          <ul className="grid gap-0.5 text-sm">
            {panel.proximosDias.length === 0 ? <li className="text-muted">Sin citas</li> : null}
            {[...panel.proximosDias].sort((a, b) => a.fecha.localeCompare(b.fecha)).map((fila) => <li key={fila.fecha} className="flex justify-between tabular-nums"><span>{textoFecha(fila.fecha).slice(0, 5)}</span><span>{fila.citados}</span></li>)}
          </ul>
        </article>
      </div>
      {periodoMeson ? <EquipoMeson filas={periodoMeson.porUsuario} recientes={panel.actividad.recientes} /> : null}
    </div>
  );
}

function EquipoMeson({ filas, recientes }: { filas: ResumenMeson["porUsuario"]; recientes: Panel["actividad"]["recientes"] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <article className="superficie overflow-hidden">
        <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">Registro sin hora por persona</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-muted"><tr><th className="px-3 py-1.5">Quién</th><th className="px-3 py-1.5 text-right">Registró</th><th className="px-3 py-1.5 text-right">Atendió</th></tr></thead>
          <tbody>
            {filas.length === 0 ? <tr><td className="px-3 py-3 text-muted" colSpan={3}>Sin registros</td></tr> : null}
            {filas.map((fila) => <tr key={fila.nombre} className="border-t border-line"><td className="px-3 py-1.5">{fila.nombre}</td><td className="px-3 py-1.5 text-right tabular-nums">{fila.registradas}</td><td className="px-3 py-1.5 text-right tabular-nums">{fila.atendidas}</td></tr>)}
          </tbody>
        </table>
      </article>
      <article className="superficie overflow-hidden">
        <h2 className="border-b border-line px-3 py-2 text-sm font-semibold">Últimos movimientos</h2>
        <ul className="divide-y divide-line text-sm">
          {recientes.length === 0 ? <li className="px-3 py-3 text-muted">Sin registros</li> : null}
          {recientes.slice(0, 6).map((fila, i) => (
            <li key={`${fila.at}-${i}`} className="flex items-baseline gap-2 px-3 py-1.5">
              <span className="truncate"><b>{fila.quien}</b> · {fila.accion.toLowerCase()} · {fila.persona}</span>
              <span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{marcaCorta(fila.at)}</span>
            </li>
          ))}
        </ul>
      </article>
    </div>
  );
}

function MesonPeriodo({ meson }: { meson: ResumenMeson }) {
  return (
    <article className="superficie grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold">Mesón sin hora</h2>
          <Link className="text-xs font-semibold text-sky" to="/atencion?vista=sin-hora">Abrir</Link>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <Cifra etiqueta="Total" valor={meson.total} />
          <Cifra etiqueta="Atendidos" valor={meson.atendidos} />
          <Cifra etiqueta="Se retiró" valor={meson.seRetiraron} />
          <Cifra etiqueta="Espera prom." valor={meson.esperaMin !== null ? `${meson.esperaMin}′` : "—"} />
        </div>
      </div>
      <div><h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Por servicio</h3><Barras filas={meson.porServicio.map((f) => [f.servicio, f.n])} /></div>
      <div><h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Por persona</h3>
        <ul className="grid gap-1 text-sm">
          {meson.porUsuario.length === 0 ? <li className="text-muted">Sin datos</li> : null}
          {meson.porUsuario.map((f) => <li key={f.nombre} className="flex justify-between gap-2"><span className="truncate">{f.nombre}</span><span className="tabular-nums text-muted">{f.registradas} reg. · {f.atendidas} at.</span></li>)}
        </ul>
      </div>
    </article>
  );
}

function Barras({ filas }: { filas: [string, number][] }) {
  const max = Math.max(1, ...filas.map(([, n]) => n));
  if (filas.length === 0) return <p className="text-sm text-muted">Sin datos</p>;
  return (
    <ul className="grid gap-1">
      {filas.slice(0, 6).map(([nombre, n]) => (
        <li key={nombre} className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 text-xs">
          <span className="relative block h-5 overflow-hidden rounded bg-paper">
            <span className="absolute inset-y-0 left-0 bg-[#fde7c4]" style={{ width: `${(n / max) * 100}%` }} />
            <span className="relative block truncate px-1.5 leading-5">{nombre}</span>
          </span>
          <span className="text-right font-semibold tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function Kpi({ etiqueta, valor, detalle, tono }: { etiqueta: string; valor: number; detalle?: string; tono?: "aviso" }) {
  return (
    <div className="px-3 py-2">
      <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{etiqueta}</p>
      <p className="flex items-baseline gap-1.5"><span className={`text-xl font-semibold tabular-nums ${tono === "aviso" ? "text-[#9a5b00]" : ""}`}>{valor}</span>{detalle ? <span className="truncate text-[11px] text-muted">{detalle}</span> : null}</p>
    </div>
  );
}

function Tarjeta({ agenda, nombre, hueco, puedeAgendar }: { agenda: string; nombre: string; hueco: Panel["huecos"][number]; puedeAgendar: boolean }) {
  const proxima = hueco.proxima;
  return (
    <article className="superficie relative flex flex-wrap items-center gap-x-4 gap-y-2 overflow-hidden px-4 py-3 pl-5">
      <span className={`absolute inset-y-0 left-0 w-1 ${agenda === "primera_vez" ? "bg-[#0d5c38]" : "bg-sky"}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{nombre} · próxima hora</p>
        <p className="flex items-baseline gap-2 tabular-nums">
          <span className="text-2xl font-semibold">{proxima ? textoFecha(proxima.fecha).slice(0, 5) : "—"}</span>
          <span className="text-lg font-semibold text-muted">{proxima ? proxima.hora : "Sin horas"}</span>
          {proxima ? <span className="text-xs text-muted">{proxima.libres} libres</span> : null}
        </p>
      </div>
      {puedeAgendar && proxima ? (
        <div className="ml-auto flex flex-wrap gap-1.5">
          {hueco.siguientes.map((item) => (
            <Link key={`${item.fecha}-${item.hora}`} className="inline-flex h-9 items-center rounded-lg border border-line bg-white px-2.5 text-sm font-medium tabular-nums hover:bg-paper" to={`/citas/nueva?agenda=${agenda}&fecha=${item.fecha}&hora=${item.hora}`}>{item.fecha === proxima.fecha ? item.hora : `${textoFecha(item.fecha).slice(0, 5)} ${item.hora}`}</Link>
          ))}
          <Link className="inline-flex h-9 items-center gap-1 rounded-lg bg-sky px-3 text-sm font-semibold text-white" to={`/citas/nueva?agenda=${agenda}&fecha=${proxima.fecha}&hora=${proxima.hora}`}>Agendar <ArrowUpRight size={15} aria-hidden /></Link>
        </div>
      ) : null}
    </article>
  );
}

function KpiFila({ kpis, docs, destino }: { kpis: Kpis; docs: number; destino: string }) {
  const filas = [
    ["Agendadas", kpis.total, kpis.total, kpis.anterior.total],
    ["Asistencia", kpis.asistieron, kpis.asistieron, kpis.anterior.asistieron],
    ["Tasa", kpis.tasa === null ? "—" : `${kpis.tasa}%`, kpis.tasa, kpis.anterior.tasa],
    ["Inasistencias", kpis.noAsistieron, kpis.noAsistieron, kpis.anterior.noAsistieron],
    ["Atrasos", kpis.atrasados, kpis.atrasados, kpis.anterior.atrasados],
    ["Cancelaciones", kpis.canceladas, kpis.canceladas, kpis.anterior.canceladas],
  ] as const;
  return (
    <div className="superficie grid grid-cols-3 divide-line sm:grid-cols-7 sm:divide-x">
      <Link to={destino} className="order-last px-3 py-2 hover:bg-paper">
        <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-muted">Docs pendientes hoy</p>
        <p className={`text-xl font-semibold tabular-nums ${docs > 0 ? "text-[#9a5b00]" : ""}`}>{docs}</p>
      </Link>
      {filas.map(([etiqueta, valor, comparado, antes]) => (
        <article key={etiqueta} className="px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{etiqueta}</p>
          <p className="flex items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums">{valor}</span>
            {typeof antes === "number" && typeof comparado === "number" ? <Delta actual={comparado} antes={antes} subeEsBueno={etiqueta !== "Inasistencias" && etiqueta !== "Atrasos" && etiqueta !== "Cancelaciones"} /> : null}
          </p>
        </article>
      ))}
    </div>
  );
}

function Actividad({ panel }: { panel: Panel }) {
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="superficie overflow-x-auto">
        <h2 className="px-3 pt-3 text-sm font-semibold">Registro por persona</h2>
        <table className="mt-1 w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">Actividad de registro</caption>
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Quién</th><th className="px-3 py-2">Agenda</th><th className="px-3 py-2 text-right">Creadas</th><th className="px-3 py-2 text-right">Reagendadas</th><th className="px-3 py-2 text-right">Canceladas</th><th className="px-3 py-2 text-right">Asistencias</th>
            </tr>
          </thead>
          <tbody>
            {panel.actividad.filas.length === 0 ? <tr><td className="p-3 text-muted" colSpan={6}>Sin registros</td></tr> : null}
            {panel.actividad.filas.map((fila) => (
              <tr key={`${fila.nombre}-${fila.agenda}`} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{fila.nombre}</td>
                <td className="px-3 py-2">{fila.agenda === "PRIMERA_VEZ" ? "Primera vez" : "General"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fila.creadas} <Delta actual={fila.creadas} antes={fila.anterior.creadas} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{fila.reagendadas} <Delta actual={fila.reagendadas} antes={fila.anterior.reagendadas} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{fila.canceladas} <Delta actual={fila.canceladas} antes={fila.anterior.canceladas} subeEsBueno={false} /></td>
                <td className="px-3 py-2 text-right tabular-nums">{fila.asistencias} <Delta actual={fila.asistencias} antes={fila.anterior.asistencias} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="superficie grid content-start gap-2 p-3 text-sm">
        {panel.actividad.recientes.length === 0 ? <li className="text-muted">Sin registros</li> : null}
        {panel.actividad.recientes.slice(0, 7).map((fila, i) => (
          <li key={`${fila.at}-${i}`} className="border-b border-line pb-1.5 last:border-0">
            <span className="flex gap-2"><span className="truncate"><span className="font-semibold">{fila.quien}</span> {fila.accion.toLowerCase()} {fila.persona}</span><span className="ml-auto shrink-0 text-xs text-muted tabular-nums">{marcaCorta(fila.at)}</span></span>
            <span className="block text-xs text-muted">{fila.agenda === "MESON" ? "Mesón sin hora" : `Cita ${textoFecha(fila.fecha).slice(0, 5)} ${fila.hora} · ${fila.agenda === "PRIMERA_VEZ" ? "Primera vez" : "General"}`}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Relevantes({ panel }: { panel: Panel }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Lista titulo="Inasistencias" filas={panel.relevantes.inasistencias.map((fila) => [fila.nombre, String(fila.n)])} />
      <Lista titulo="Repetidas" filas={panel.relevantes.repetidas.map((fila) => [fila.nombre, String(fila.n)])} />
      <Lista titulo="Trámites" filas={panel.relevantes.tramites.map((fila) => [fila.nombre, String(fila.citas)])} />
      <Lista titulo="Ocupación" filas={panel.relevantes.ocupacion.map((fila) => [fila.hora, String(fila.citas)])} />
    </div>
  );
}

function Lista({ titulo, filas }: { titulo: string; filas: string[][] }) {
  return (
    <article className="superficie p-3">
      <h2 className="text-sm font-semibold">{titulo}</h2>
      <ul className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-1 text-sm">
        {filas.length === 0 ? <li className="text-muted">Sin datos</li> : null}
        {filas.map(([nombre, n], i) => <li key={`${nombre}-${i}`} className="flex justify-between gap-2"><span className="min-w-0 truncate" title={nombre}>{nombre}</span><span className="shrink-0 tabular-nums">{n}</span></li>)}
      </ul>
    </article>
  );
}


function Calendario({ nombre, mes, dias, laborables, feriados, onMes }: { nombre: string; mes: string; dias: DiaMes[]; laborables: number[]; feriados: string[]; onMes: (delta: number) => void }) {
  const mapa = new Map(dias.map((dia) => [dia.fecha, dia]));
  const hoy = fechaHoy();
  const grilla = grillaLaborable(mes, [1, 2, 3, 4, 5, 6, 7]);
  return (
    <article className="superficie p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">{nombre}</h2>
        <div className="flex gap-1">
          <button type="button" className="h-9 w-9 rounded-lg border border-line" aria-label="Mes anterior" onClick={() => onMes(-1)}>‹</button>
          <button type="button" className="h-9 w-9 rounded-lg border border-line" aria-label="Mes siguiente" onClick={() => onMes(1)}>›</button>
        </div>
      </div>
      <div className="grid gap-1 text-center text-[11px] font-medium uppercase text-muted" style={{ gridTemplateColumns: `repeat(${grilla.etiquetas.length}, minmax(0,1fr))` }}>
        {grilla.etiquetas.map((dia) => <span key={dia}>{dia}</span>)}
      </div>
      <div className="cal-compacto mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${grilla.etiquetas.length}, minmax(0,1fr))` }}>
        {grilla.celdas.map((fecha, indice) => {
          if (!fecha) return <span key={`v-${indice}`} />;
          const dia = mapa.get(fecha);
          const libres = dia?.libres ?? 0;
          const pasado = fecha < hoy;
          const laboral = laborables.includes(diaSemanaIso(fecha));
          const feriado = feriados.includes(fecha) || Boolean(dia?.feriado);
          const ocupacion = (dia?.atendidas ?? 0) > 0 ? dia?.atendidas ?? 0 : dia?.ocupados ?? 0;
          const clase = feriado ? "cal-feriado" : !laboral ? "cal-cerrado" : pasado ? "cal-pasado" : libres > 0 ? "cal-libre" : "cal-vacio";
          const detalle = feriado ? "Feriado" : !laboral ? "—" : pasado ? String(ocupacion) : `${libres} libres`;
          return <div key={fecha} className={`cal-dia ${clase} ${fecha === hoy ? "is-today" : ""}`}><span className="font-medium">{Number(fecha.slice(8))}</span><span className="cal-meta">{detalle}</span></div>;
        })}
      </div>
    </article>
  );
}

function Delta({ actual, antes, subeEsBueno = true }: { actual: number; antes: number; subeEsBueno?: boolean }) {
  const n = actual - antes;
  const favorable = subeEsBueno ? n >= 0 : n <= 0;
  const flecha = n > 0 ? "↑" : n < 0 ? "↓" : "·";
  const titulo = `Período anterior: ${antes}`;
  return (
    <span tabIndex={0} title={titulo} className={`group relative cursor-help text-xs font-semibold ${favorable ? "text-[#146c43]" : "text-alert"}`}>
      {flecha} {Math.abs(n)}
      <span role="tooltip" className="pointer-events-none absolute bottom-full left-0 z-20 mb-1 hidden whitespace-nowrap rounded bg-[#1e283c] px-2 py-1 text-[11px] font-medium text-white group-hover:block group-focus:block">{titulo}</span>
    </span>
  );
}
function marcaCorta(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(fecha).map((x) => [x.type, x.value]));
  return `${p.day}-${p.month} ${p.hour}:${p.minute}`;
}
function sumar(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}
function moverMes(mes: string, deltaMes: number): string {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio, numero - 1 + deltaMes, 1)).toISOString().slice(0, 7);
}
