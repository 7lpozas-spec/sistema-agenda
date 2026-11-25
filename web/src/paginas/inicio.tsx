import {
  CalendarCheck,
  Clock3,
  Percent,
  UserX,
  XCircle,
  ArrowUpRight,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fechaHoy } from "../api";
import { Fecha, grillaLaborable, textoFecha } from "../fecha";
import { Aviso, Esqueleto } from "../ui";
import { useVivo } from "../vivo";

interface Tramo {
  total: number;
  asistieron: number;
  noAsistieron: number;
  atrasados: number;
  canceladas: number;
  tasa: number | null;
}
interface Kpis extends Tramo {
  anterior: Tramo;
}
interface Hueco {
  fecha: string;
  hora: string;
  libres: number;
}
interface Huecos {
  agendas: { agenda: string; proxima: Hueco | null; siguientes: Hueco[] }[];
}
interface DiaMes {
  agenda: string;
  fecha: string;
  libres: number;
}

const AGENDAS = [
  { id: "GENERAL", ruta: "general", nombre: "Agenda general" },
  { id: "PRIMERA_VEZ", ruta: "primera_vez", nombre: "Agenda primera vez" },
] as const;

export function Inicio() {
  const hoy = fechaHoy();
  const [desde, setDesde] = useState(() => sumar(hoy, -21));
  const [hasta, setHasta] = useState(hoy);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [huecos, setHuecos] = useState<Huecos | null>(null);
  const [mes, setMes] = useState(hoy.slice(0, 7));
  const [dias, setDias] = useState<DiaMes[]>([]);
  const [laborables, setLaborables] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [elegido, setElegido] = useState<{
    agenda: string;
    fecha: string;
  } | null>(null);
  const [horas, setHoras] = useState<Hueco[]>([]);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = useCallback(
    (filtros = { desde, hasta }) => {
      const params = new URLSearchParams({
        desde: filtros.desde,
        hasta: filtros.hasta,
      });
      setCargando(true);
      setError("");
      void Promise.all([
        api<{ kpis: Kpis }>(`/api/estadisticas?${params}`),
        api<Huecos>("/api/huecos"),
      ])
        .then(([estadisticas, disponibilidad]) => {
          setKpis(estadisticas.kpis);
          setHuecos(disponibilidad);
        })
        .catch((falla: unknown) =>
          setError(
            falla instanceof Error ? falla.message : "No se pudo cargar.",
          ),
        )
        .finally(() => setCargando(false));
    },
    [desde, hasta],
  );

  const cargarMes = useCallback((valor: string) => {
    void api<{ dias: DiaMes[]; laborables: number[] }>(
      `/api/disponibilidad/mes?mes=${valor}`,
    )
      .then((datos) => {
        setDias(datos.dias);
        setLaborables((actual) =>
          actual.join() === (datos.laborables ?? []).join()
            ? actual
            : datos.laborables?.length
              ? datos.laborables
              : actual,
        );
      })
      .catch((falla: unknown) =>
        setError(
          falla instanceof Error ? falla.message : "No se pudo leer el mes.",
        ),
      );
  }, []);

  useEffect(() => {
    document.title = "Dashboard · Licencias Recoleta";
    cargar();
  }, [cargar]);
  useEffect(() => {
    cargarMes(mes);
  }, [cargarMes, mes]);
  useVivo(
    useCallback(() => {
      cargar();
      cargarMes(mes);
    }, [cargar, cargarMes, mes]),
  );

  useEffect(() => {
    if (!elegido) {
      setHoras([]);
      return;
    }
    const ruta = elegido.agenda === "PRIMERA_VEZ" ? "PRIMERA_VEZ" : "GENERAL";
    void api<Huecos>(`/api/huecos?agenda=${ruta}&dia=${elegido.fecha}`)
      .then((datos) => setHoras(datos.agendas[0]?.siguientes ?? []))
      .catch(() => setHoras([]));
  }, [elegido]);

  const fechaLarga = new Intl.DateTimeFormat("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "America/Santiago",
  }).format(new Date());
  const qs = new URLSearchParams({ desde, hasta });
  const tarjetas = kpis
    ? [
        {
          etiqueta: "Agendadas",
          valor: String(kpis.total),
          delta: kpis.total - kpis.anterior.total,
          icono: CalendarCheck,
          sube: true,
        },
        {
          etiqueta: "Asistencia",
          valor: String(kpis.asistieron),
          delta: kpis.asistieron - kpis.anterior.asistieron,
          icono: CalendarCheck,
          sube: true,
        },
        {
          etiqueta: "Tasa",
          valor: kpis.tasa === null ? "—" : `${kpis.tasa}%`,
          delta:
            kpis.tasa === null || kpis.anterior.tasa === null
              ? null
              : kpis.tasa - kpis.anterior.tasa,
          icono: Percent,
          sube: true,
        },
        {
          etiqueta: "Inasistencias",
          valor: String(kpis.noAsistieron),
          delta: kpis.noAsistieron - kpis.anterior.noAsistieron,
          icono: UserX,
          sube: false,
        },
        {
          etiqueta: "Atrasos",
          valor: String(kpis.atrasados),
          delta: kpis.atrasados - kpis.anterior.atrasados,
          icono: Clock3,
          sube: false,
        },
        {
          etiqueta: "Cancelaciones",
          valor: String(kpis.canceladas),
          delta: kpis.canceladas - kpis.anterior.canceladas,
          icono: XCircle,
          sube: false,
        },
      ]
    : [];

  return (
    <section className="grid gap-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">
            {fechaLarga.charAt(0).toUpperCase() + fechaLarga.slice(1)}
          </p>
          <h1 className="page-title mt-1">Dashboard</h1>
          <p className="mt-2 text-sm text-muted">
            Disponibilidad y seguimiento de la atención.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm font-medium leading-9"
            href={`/api/export/estadisticas.csv?${qs}`}
          >
            CSV
          </a>
          <a
            className="h-9 rounded-lg bg-[#1e283c] px-3 text-sm font-semibold leading-9 text-white"
            href={`/api/export/estadisticas.xlsx?${qs}`}
          >
            Descargar Excel
          </a>
          <a
            className="h-9 rounded-lg border border-line bg-white px-3 text-sm font-medium leading-9"
            href={`/api/export/reporte-diario.pdf?fecha=${hoy}`}
          >
            PDF
          </a>
        </div>
      </header>

      {error ? <Aviso>{error}</Aviso> : null}
      {cargando && !kpis ? <Esqueleto /> : null}

      {huecos ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {AGENDAS.map((agenda) => {
            const fila = huecos.agendas.find(
              (item) => item.agenda === agenda.id,
            );
            const proxima = fila?.proxima ?? null;
            const siguientes = (fila?.siguientes ?? [])
              .filter(
                (hueco) =>
                  !proxima ||
                  hueco.fecha !== proxima.fecha ||
                  hueco.hora !== proxima.hora,
              )
              .slice(0, 3);
            return (
              <article key={agenda.id} className="availability-card">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{agenda.nombre}</p>
                  <span className="rounded-md bg-[#edf3ff] p-2 text-sky">
                    <CalendarCheck size={18} aria-hidden />
                  </span>
                </div>
                <p className="page-eyebrow mt-2">Próximo cupo disponible</p>
                <p className="mt-1 text-[2rem] leading-none font-semibold tracking-tight tabular-nums">
                  {proxima ? proxima.hora : "—"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {proxima ? textoFecha(proxima.fecha) : "Sin horas"}
                </p>
                {proxima ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      className="btn bg-sky text-white"
                      to={`/citas/nueva?agenda=${agenda.ruta}&fecha=${proxima.fecha}&hora=${proxima.hora}`}
                    >
                      Agendar <ArrowUpRight size={15} aria-hidden />
                    </Link>
                    {siguientes.map((hueco) => (
                      <Link
                        key={`${hueco.fecha}-${hueco.hora}`}
                        className="btn border border-line bg-white text-ink hover:bg-paper"
                        to={`/citas/nueva?agenda=${agenda.ruta}&fecha=${hueco.fecha}&hora=${hueco.hora}`}
                      >
                        {hueco.fecha === proxima.fecha
                          ? hueco.hora
                          : `${hueco.fecha.slice(8)}-${hueco.fecha.slice(5, 7)} ${hueco.hora}`}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-2xl bg-[#e6e8ee]"
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold">{rangoCorto(desde, hasta)}</h2>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(evento) => {
            evento.preventDefault();
            cargar();
          }}
        >
          <Fecha
            id="dash-desde"
            etiqueta="Desde"
            valor={desde}
            alCambiar={setDesde}
            laborables={laborables}
          />
          <Fecha
            id="dash-hasta"
            etiqueta="Hasta"
            valor={hasta}
            alCambiar={setHasta}
            laborables={laborables}
          />
          <button
            className="h-10 rounded-lg border border-line bg-white px-4 text-sm font-medium"
            type="submit"
          >
            Filtrar
          </button>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {tarjetas.map((tarjeta) => {
          const favorable =
            tarjeta.delta === null
              ? true
              : tarjeta.sube
                ? tarjeta.delta >= 0
                : tarjeta.delta <= 0;
          return (
            <article
              key={tarjeta.etiqueta}
              className="superficie metric-card px-4 py-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted">
                  {tarjeta.etiqueta}
                </p>
                <tarjeta.icono size={16} className="text-sky" aria-hidden />
              </div>
              <p className="mt-2 text-2xl leading-none font-semibold tabular-nums">
                {tarjeta.valor}
              </p>
              <p
                className={`mt-2 text-xs font-medium tabular-nums ${tarjeta.delta === null ? "text-transparent" : favorable ? "text-[#146c43]" : "text-alert"}`}
              >
                {tarjeta.delta === null
                  ? "0"
                  : `${tarjeta.delta >= 0 ? "+" : ""}${tarjeta.delta}`}
                {tarjeta.delta !== null ? (
                  <span className="ml-1 font-normal text-muted">
                    vs. anterior
                  </span>
                ) : null}
              </p>
            </article>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{tituloMes(mes)}</h2>
        <div className="flex gap-2">
          <button
            type="button"
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
            aria-label="Mes anterior"
            onClick={() => {
              setMes(moverMes(mes, -1));
              setElegido(null);
            }}
          >
            ‹
          </button>
          <button
            type="button"
            className="h-10 rounded-lg border border-line bg-white px-3 text-sm"
            aria-label="Mes siguiente"
            onClick={() => {
              setMes(moverMes(mes, 1));
              setElegido(null);
            }}
          >
            ›
          </button>
        </div>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {AGENDAS.map((agenda) => (
          <CalendarioMes
            key={agenda.id}
            nombre={agenda.nombre}
            ruta={agenda.ruta}
            mes={mes}
            dias={dias.filter((fila) => fila.agenda === agenda.id)}
            laborables={laborables}
            elegido={elegido?.agenda === agenda.id ? elegido.fecha : ""}
            horas={elegido?.agenda === agenda.id ? horas : []}
            onElegir={(fecha) => setElegido({ agenda: agenda.id, fecha })}
          />
        ))}
      </div>
    </section>
  );
}

function CalendarioMes({
  nombre,
  ruta,
  mes,
  dias,
  laborables,
  elegido,
  horas,
  onElegir,
}: {
  nombre: string;
  ruta: string;
  mes: string;
  dias: DiaMes[];
  laborables: number[];
  elegido: string;
  horas: Hueco[];
  onElegir: (fecha: string) => void;
}) {
  const mapa = new Map(dias.map((dia) => [dia.fecha, dia.libres]));
  const maximo = Math.max(1, ...dias.map((dia) => dia.libres));
  const hoy = fechaHoy();
  const grilla = grillaLaborable(mes, laborables);
  return (
    <article className="superficie p-3 sm:p-4">
      <h3 className="mb-2 text-sm font-semibold">{nombre}</h3>
      <div
        className="grid gap-1 text-center text-[11px] font-medium text-muted uppercase"
        style={{
          gridTemplateColumns: `repeat(${grilla.etiquetas.length}, minmax(0, 1fr))`,
        }}
      >
        {grilla.etiquetas.map((dia) => (
          <span key={dia}>{dia}</span>
        ))}
      </div>
      <div
        className="mt-1 grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${grilla.etiquetas.length}, minmax(0, 1fr))`,
        }}
      >
        {grilla.celdas.map((fecha, indice) => {
          if (!fecha) return <span key={`v-${indice}`} />;
          const libres = mapa.get(fecha) ?? 0;
          const activo = fecha === elegido;
          const pasado = fecha < hoy;
          const intensidad = Math.min(1, libres / maximo);
          return (
            <button
              key={fecha}
              type="button"
              disabled={libres <= 0}
              onClick={() => onElegir(fecha)}
              className={`flex min-h-11 flex-col items-start rounded-md px-1.5 py-1 text-left text-sm transition-colors disabled:opacity-100 ${activo ? "bg-pine text-white" : libres > 0 ? "text-ink hover:brightness-95" : pasado ? "bg-[#efeae3] text-[#5c564e]" : "bg-[#f7f3ee] text-[#8a8178]"} ${fecha === hoy && !activo ? "ring-2 ring-pine ring-offset-1" : ""}`}
              style={
                libres > 0 && !activo
                  ? {
                      background: `rgba(61, 95, 212, ${(0.08 + intensidad * 0.3).toFixed(3)})`,
                    }
                  : undefined
              }
            >
              <span className="font-medium">{Number(fecha.slice(8))}</span>
              {libres > 0 ? (
                <span
                  className={`mt-auto text-[11px] font-semibold tabular-nums ${activo ? "text-white/90" : "text-pine"}`}
                >
                  {libres}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {elegido ? (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
          {horas.length === 0 ? (
            <p className="text-sm text-muted">Sin horas</p>
          ) : (
            horas.map((hueco) => (
              <Link
                key={hueco.hora}
                className="h-9 rounded-full bg-[#1e283c] px-3 text-sm font-medium leading-9 text-white"
                to={`/citas/nueva?agenda=${ruta}&fecha=${hueco.fecha}&hora=${hueco.hora}`}
              >
                {hueco.hora}
              </Link>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}

function tituloMes(mes: string): string {
  const texto = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${mes}-01T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function moverMes(mes: string, delta: number): string {
  const [anio, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(anio, numero - 1 + delta, 1))
    .toISOString()
    .slice(0, 7);
}

function rangoCorto(desde: string, hasta: string): string {
  const a = textoFecha(desde);
  const b = textoFecha(hasta);
  if (a.slice(6) === b.slice(6)) return `${a.slice(0, 5)} al ${b.slice(0, 5)}`;
  return `${a} al ${b}`;
}

function sumar(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias))
    .toISOString()
    .slice(0, 10);
}
