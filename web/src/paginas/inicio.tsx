import { ArrowUpRight } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fechaHoy } from "../api";
import { Fecha, diaSemanaIso, grillaLaborable, textoFecha } from "../fecha";
import { Aviso, Esqueleto } from "../ui";
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
  hoy: { fecha: string; citados: number; llegaron: number; faltan: number; inasistencias: number; aTiempo: number; atrasados: number; proxima: { id: string; hora: string; nombre: string; tramite: string } | null };
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

export function Inicio() {
  const hoy = fechaHoy();
  const [desde, setDesde] = useState(() => sumar(hoy, -21));
  const [hasta, setHasta] = useState(hoy);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [panel, setPanel] = useState<Panel | null>(null);
  const [error, setError] = useState("");

  const cargar = useCallback(() => {
    const params = new URLSearchParams({ desde, hasta, mes });
    void api<Panel>(`/api/panel?${params}`)
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
    <section className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">Dashboard</h1>
        {panel?.exportar ? (
          <div className="flex flex-wrap gap-2">
            <a className="h-9 rounded-lg border border-line bg-white px-3 text-sm font-medium leading-9" href={`/api/export/estadisticas.csv?${qs}`}>CSV</a>
            <a className="h-9 rounded-lg bg-[#1e283c] px-3 text-sm font-semibold leading-9 text-white" href={`/api/export/estadisticas.xlsx?${qs}`}>Excel</a>
            <a className="h-9 rounded-lg border border-line bg-white px-3 text-sm font-medium leading-9" href={`/api/export/reporte-diario.pdf?fecha=${hoy}${exportAgenda ? `&agenda=${exportAgenda}` : ""}`}>PDF</a>
          </div>
        ) : null}
      </header>
      {error ? <Aviso>{error}</Aviso> : null}
      {panel && vista === "recepcion" ? <Recepcion panel={panel} /> : null}
      {panel && vista === "instructor" ? <Instructor panel={panel} /> : null}
      {panel && (vista === "operador" || vista === "admin") ? <Oficina panel={panel} /> : null}
      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); cargar(); }}>
        <Fecha id="dash-desde" etiqueta="Desde" valor={desde} alCambiar={setDesde} laborables={panel?.mes.laborables} />
        <Fecha id="dash-hasta" etiqueta="Hasta" valor={hasta} alCambiar={setHasta} laborables={panel?.mes.laborables} />
        <button className="h-10 rounded-lg border border-line bg-white px-4 text-sm font-medium" type="submit">Filtrar</button>
      </form>
      {panel?.kpis ? <KpiFila kpis={panel.kpis} /> : null}
      {panel && vista === "admin" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {panel.kpisPorAgenda.map((fila) => (
            <article key={fila.agenda} className="superficie px-4 py-3">
              <p className="text-sm font-semibold">{fila.agenda === "PRIMERA_VEZ" ? "Primera vez" : "General"}</p>
              <p className="mt-1 text-sm tabular-nums">{fila.total} citas · {fila.asistieron} asistencias · {fila.noAsistieron} inasistencias · {fila.atrasados} atrasos</p>
            </article>
          ))}
        </div>
      ) : null}
      {panel && vista !== "recepcion" ? (
        <div className={`grid gap-4 ${vista === "admin" ? "xl:grid-cols-2" : ""}`}>
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
      {panel ? <Actividad panel={panel} /> : null}
      {panel && vista !== "recepcion" ? <Relevantes panel={panel} /> : null}
    </section>
  );
}

function Oficina({ panel }: { panel: Panel }) {
  const general = panel.huecos.find((fila) => fila.agenda === "GENERAL");
  const primera = panel.huecos.find((fila) => fila.agenda === "PRIMERA_VEZ");
  return (
    <div className="grid gap-3">
      {general ? <Tarjeta agenda="general" nombre="Agenda general" hueco={general} grande puedeAgendar={panel.puedeAgendar} /> : null}
      {primera && panel.vista === "operador" ? (
        <article className="superficie flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p className="text-sm font-semibold">Primera vez</p>
          <p className="text-sm tabular-nums">{primera.proxima ? `${primera.proxima.fecha.slice(8)}-${primera.proxima.fecha.slice(5, 7)} ${primera.proxima.hora}` : "Sin horas"}</p>
          {panel.puedeAgendar && primera.proxima ? <Link className="btn bg-sky text-white" to={`/citas/nueva?agenda=primera_vez&fecha=${primera.proxima.fecha}&hora=${primera.proxima.hora}`}>Agendar</Link> : null}
        </article>
      ) : null}
      {panel.vista === "admin" && primera ? <Tarjeta agenda="primera_vez" nombre="Primera vez" hueco={primera} grande puedeAgendar={panel.puedeAgendar} /> : null}
    </div>
  );
}

function Instructor({ panel }: { panel: Panel }) {
  const hueco = panel.huecos[0];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <article className="superficie p-4">
        <p className="text-sm font-semibold">Hoy</p>
        {panel.hoy.proxima ? (
          <Link className="mt-2 block" to={`/citas/${panel.hoy.proxima.id}`}>
            <p className="text-3xl font-semibold tabular-nums">{panel.hoy.proxima.hora}</p>
            <p className="text-lg">{panel.hoy.proxima.nombre}</p>
            <p className="text-sm text-muted">{panel.hoy.proxima.tramite}</p>
          </Link>
        ) : <p className="mt-2 text-sm text-muted">Sin pendientes</p>}
        <p className="mt-3 text-sm tabular-nums">{panel.hoy.faltan} pendientes · {panel.hoy.llegaron} llegaron · {panel.hoy.inasistencias} inasistencias</p>
        <Link className="btn mt-3 border border-line bg-white" to="/agenda/primera_vez">Abrir día</Link>
      </article>
      {hueco ? <Tarjeta agenda="primera_vez" nombre="Próximo cupo" hueco={hueco} grande={false} puedeAgendar={false} /> : null}
    </div>
  );
}

function Recepcion({ panel }: { panel: Panel }) {
  const maximo = Math.max(1, ...panel.flujo.map((fila) => fila.citados));
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Mini etiqueta="Citados" valor={panel.hoy.citados} />
        <Mini etiqueta="Llegaron" valor={panel.hoy.llegaron} />
        <Mini etiqueta="A tiempo" valor={panel.hoy.aTiempo} />
        <Mini etiqueta="Atrasos" valor={panel.hoy.atrasados} />
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <article className="superficie p-4">
          <p className="text-sm font-semibold">Período</p>
          <p className="mt-2 text-sm tabular-nums">{panel.periodo.llegaron} llegaron · {panel.periodo.aTiempo} a tiempo · {panel.periodo.atrasados} atrasos · {panel.periodo.inasistencias} inasistencias</p>
          <p className="mt-1 text-xs"><Delta actual={panel.periodo.llegaron} antes={panel.periodo.anterior.llegaron} /> llegaron</p>
          {panel.periodo.esperaMin !== null ? <p className="mt-2 text-sm tabular-nums">Espera {panel.periodo.esperaMin} min</p> : null}
        </article>
        <article className="superficie p-4">
          <p className="text-sm font-semibold">Por hora</p>
          <ul className="mt-2 grid gap-1">
            {panel.flujo.map((fila) => (
              <li key={fila.hora} className="grid grid-cols-[3.2rem_minmax(0,1fr)_3.2rem] items-center gap-2 text-sm">
                <span className="tabular-nums">{fila.hora}</span>
                <span className="h-2 rounded bg-[#d9e4ff]" style={{ width: `${Math.max(8, Math.round((fila.citados / maximo) * 100))}%` }} />
                <span className="tabular-nums">{fila.llegaron}/{fila.citados}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="superficie p-4">
          <p className="text-sm font-semibold">Próximos días</p>
          <ul className="mt-2 grid gap-1 text-sm">
            {panel.proximosDias.map((fila) => <li key={fila.fecha} className="flex justify-between tabular-nums"><span>{textoFecha(fila.fecha).slice(0, 5)}</span><span>{fila.citados}</span></li>)}
          </ul>
        </article>
      </div>
    </div>
  );
}

function Tarjeta({ agenda, nombre, hueco, grande, puedeAgendar }: { agenda: string; nombre: string; hueco: Panel["huecos"][number]; grande: boolean; puedeAgendar: boolean }) {
  const proxima = hueco.proxima;
  return (
    <article className="availability-card">
      <p className="text-sm font-semibold">{nombre}</p>
      <p className={`${grande ? "text-[2rem]" : "text-2xl"} mt-2 font-semibold tabular-nums`}>{proxima ? `${proxima.fecha.slice(8)}-${proxima.fecha.slice(5, 7)}` : "—"}</p>
      <p className="text-sm text-muted">{proxima ? proxima.hora : "Sin horas"}</p>
      {puedeAgendar && proxima ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="btn bg-sky text-white" to={`/citas/nueva?agenda=${agenda}&fecha=${proxima.fecha}&hora=${proxima.hora}`}>Agendar <ArrowUpRight size={15} aria-hidden /></Link>
          {hueco.siguientes.map((item) => (
            <Link key={`${item.fecha}-${item.hora}`} className="btn border border-line bg-white" to={`/citas/nueva?agenda=${agenda}&fecha=${item.fecha}&hora=${item.hora}`}>{item.fecha === proxima.fecha ? item.hora : `${item.fecha.slice(8)}-${item.fecha.slice(5, 7)} ${item.hora}`}</Link>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function KpiFila({ kpis }: { kpis: Kpis }) {
  const filas = [
    ["Agendadas", kpis.total, kpis.total, kpis.anterior.total],
    ["Asistencia", kpis.asistieron, kpis.asistieron, kpis.anterior.asistieron],
    ["Tasa", kpis.tasa === null ? "—" : `${kpis.tasa}%`, kpis.tasa, kpis.anterior.tasa],
    ["Inasistencias", kpis.noAsistieron, kpis.noAsistieron, kpis.anterior.noAsistieron],
    ["Atrasos", kpis.atrasados, kpis.atrasados, kpis.anterior.atrasados],
    ["Cancelaciones", kpis.canceladas, kpis.canceladas, kpis.anterior.canceladas],
  ] as const;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
      {filas.map(([etiqueta, valor, comparado, antes]) => (
        <article key={etiqueta} className="superficie px-4 py-3">
          <p className="text-xs font-medium text-muted">{etiqueta}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
          <p className="mt-1 text-xs">{typeof antes === "number" && typeof comparado === "number" ? <Delta actual={comparado} antes={antes} subeEsBueno={etiqueta !== "Inasistencias" && etiqueta !== "Atrasos" && etiqueta !== "Cancelaciones"} /> : null}</p>
        </article>
      ))}
    </div>
  );
}

function Actividad({ panel }: { panel: Panel }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <div className="superficie overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <caption className="sr-only">Actividad de registro</caption>
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              <th className="p-3">Quién</th><th className="p-3">Agenda</th><th className="p-3">Creadas</th><th className="p-3">Reagendadas</th><th className="p-3">Canceladas</th><th className="p-3">Asistencias</th>
            </tr>
          </thead>
          <tbody>
            {panel.actividad.filas.length === 0 ? <tr><td className="p-3 text-muted" colSpan={6}>Sin registros</td></tr> : null}
            {panel.actividad.filas.map((fila) => (
              <tr key={`${fila.nombre}-${fila.agenda}`} className="border-b border-line">
                <td className="p-3">{fila.nombre}</td>
                <td className="p-3">{fila.agenda === "PRIMERA_VEZ" ? "Primera vez" : "General"}</td>
                <td className="p-3 tabular-nums">{fila.creadas} <Delta actual={fila.creadas} antes={fila.anterior.creadas} /></td>
                <td className="p-3 tabular-nums">{fila.reagendadas} <Delta actual={fila.reagendadas} antes={fila.anterior.reagendadas} /></td>
                <td className="p-3 tabular-nums">{fila.canceladas} <Delta actual={fila.canceladas} antes={fila.anterior.canceladas} subeEsBueno={false} /></td>
                <td className="p-3 tabular-nums">{fila.asistencias} <Delta actual={fila.asistencias} antes={fila.anterior.asistencias} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="superficie grid content-start gap-2 p-3 text-sm">
        {panel.actividad.recientes.length === 0 ? <li className="text-muted">Sin registros</li> : null}
        {panel.actividad.recientes.map((fila, i) => (
          <li key={`${fila.at}-${i}`} className="border-b border-line pb-2">
            <span className="font-semibold">{fila.quien}</span> {fila.accion.toLowerCase()} {fila.persona}
            <span className="block text-xs text-muted">{textoFecha(fila.fecha).slice(0, 5)} {fila.hora} · {fila.agenda === "PRIMERA_VEZ" ? "Primera vez" : "General"}</span>
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
      <ul className="mt-2 grid gap-1 text-sm">
        {filas.length === 0 ? <li className="text-muted">Sin datos</li> : null}
        {filas.map(([nombre, n]) => <li key={nombre} className="flex justify-between gap-2"><span className="truncate">{nombre}</span><span className="tabular-nums">{n}</span></li>)}
      </ul>
    </article>
  );
}

function Mini({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return <article className="superficie px-3 py-3"><p className="text-xs text-muted">{etiqueta}</p><p className="text-2xl font-semibold tabular-nums">{valor}</p></article>;
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
      <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${grilla.etiquetas.length}, minmax(0,1fr))` }}>
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
function sumar(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}
function moverMes(mes: string, deltaMes: number): string {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio, numero - 1 + deltaMes, 1)).toISOString().slice(0, 7);
}
