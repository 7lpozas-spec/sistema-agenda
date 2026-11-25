import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fechaHoy } from "../api";
import { Fecha, grillaLaborable } from "../fecha";
import { useAuth } from "../auth";
import { Aviso, Esqueleto, Estado, Tabla, Vacio, avisar, tonoEstado } from "../ui";

interface Bloque { hora: string; capacidad: number; usados: number }
interface Cita {
  id: string;
  hora: string;
  estado: string;
  nombre: string;
  rut: string;
  tramite: string;
}
interface DiaMes { fecha: string; capacidad: number; usados: number }

function sumar(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}
function lunesDe(iso: string): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return sumar(iso, -(semana === 0 ? 6 : semana - 1));
}
function CalendarioMes({ mes, dias, laborables, onElegir }: { mes: string; dias: DiaMes[]; laborables: number[]; onElegir: (fecha: string) => void }) {
  const grilla = grillaLaborable(mes, laborables);
  const mapa = new Map(dias.map((dia) => [dia.fecha, dia]));
  const hoy = fechaHoy();
  return (
    <div className="superficie p-3 sm:p-4">
      <div className="grid gap-1 text-center text-[11px] font-medium text-muted uppercase" style={{ gridTemplateColumns: `repeat(${grilla.etiquetas.length}, minmax(0, 1fr))` }}>
        {grilla.etiquetas.map((dia) => <div key={dia}>{dia}</div>)}
      </div>
      <div className="mt-1 grid gap-1" style={{ gridTemplateColumns: `repeat(${grilla.etiquetas.length}, minmax(0, 1fr))` }}>
        {grilla.celdas.map((fecha, indice) => {
          if (!fecha) return <span key={`vacio-${indice}`} />;
          const dia = mapa.get(fecha) ?? { fecha, usados: 0, capacidad: 0 };
          const pasado = fecha < hoy;
          return (
            <button
              key={fecha}
              type="button"
              className={`min-h-16 rounded-lg border p-2 text-left text-sm disabled:opacity-100 ${fecha === hoy ? "border-pine bg-white" : pasado ? "border-transparent bg-[#efeae3] text-[#5c564e]" : "border-line bg-white"}`}
              onClick={() => onElegir(fecha)}
            >
              <span className="block font-semibold">{Number(fecha.slice(8))}</span>
              {dia.capacidad > 0 ? (
                <span className="mt-2 block h-1 overflow-hidden rounded-full bg-[#e8eef8]">
                  <span className="block h-1 bg-sky" style={{ width: `${Math.min(100, Math.round((dia.usados / dia.capacidad) * 100))}%` }} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CORTOS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function mesLegible(iso: string): string {
  const texto = new Intl.DateTimeFormat("es-CL", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 7)}-01T12:00:00Z`));
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function etiquetaCorta(iso: string): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return `${CORTOS[js === 0 ? 7 : js]} ${dia}`;
}

function nombreCorto(nombre: string): string {
  return nombre.split(",")[1]?.trim().split(" ")[0] ?? nombre;
}

export function Agenda() {
  const { agenda = "general" } = useParams();
  const { usuario } = useAuth();
  const [vista, setVista] = useState<"dia" | "semana" | "mes">("dia");
  const [fecha, setFecha] = useState(fechaHoy());
  const [bloques, setBloques] = useState<Bloque[] | null>(null);
  const [citas, setCitas] = useState<Cita[]>([]);
  const [semana, setSemana] = useState<{ fecha: string; bloques: Bloque[]; citas: Cita[] }[]>([]);
  const [mes, setMes] = useState<DiaMes[] | null>(null);
  const [laborables, setLaborables] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [error, setError] = useState("");
  const [moviendo, setMoviendo] = useState("");
  const agendaId = agenda === "primera_vez" ? "PRIMERA_VEZ" : "GENERAL";
  const titulo = agenda === "primera_vez" ? "Agenda primera vez" : "Agenda general";
  const puedeReservar = usuario?.rol === "ADMIN" || usuario?.rol === "OPERADOR_AGENDA";

  function cargarDia(dia = fecha) {
    setError("");
    setBloques(null);
    void api<{ bloques: Bloque[]; citas: Cita[]; laborables?: number[] }>(`/api/agendas/${agendaId}/dia/${dia}`)
      .then((datos) => {
        setBloques(datos.bloques);
        setCitas(datos.citas);
        if (datos.laborables?.length) {
          setLaborables((actual) => (actual.join() === datos.laborables?.join() ? actual : datos.laborables ?? actual));
        }
      })
      .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo leer la agenda."));
  }

  useEffect(() => {
    document.title = `${titulo} · Licencias Recoleta`;
    if (vista === "dia") cargarDia(fecha);
    if (vista === "semana") {
      const inicio = lunesDe(fecha);
      const dias = laborables.map((dia) => sumar(inicio, dia - 1));
      void Promise.all(dias.map((dia) => api<{ bloques: Bloque[]; citas: Cita[] }>(`/api/agendas/${agendaId}/dia/${dia}`).then((datos) => ({ fecha: dia, bloques: datos.bloques, citas: datos.citas })).catch(() => ({ fecha: dia, bloques: [] as Bloque[], citas: [] as Cita[] }))))
        .then(setSemana);
    }
    if (vista === "mes") {
      setMes(null);
      void api<{ dias: DiaMes[]; laborables: number[] }>(`/api/agendas/${agendaId}/disponibilidad?mes=${fecha.slice(0, 7)}`)
        .then((datos) => {
          setMes(datos.dias);
          setLaborables((actual) => (actual.join() === (datos.laborables ?? []).join() ? actual : (datos.laborables?.length ? datos.laborables : actual)));
        })
        .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo leer el mes."));
    }
  }, [agenda, fecha, titulo, vista, laborables]);

  async function mover(citaId: string, hora: string, dia = fecha) {
    if (!citaId || !puedeReservar) return;
    try {
      await api(`/api/citas/${citaId}/reagendar`, { method: "POST", body: { fecha: dia, hora } });
      avisar(`La cita quedó a las ${hora}.`);
      cargarDia(dia);
    } catch (falla) {
      avisar(falla instanceof Error ? falla.message : "No se pudo reagendar.", "error");
    }
  }

  const columnas = semana.filter((dia) => dia.bloques.length > 0 || dia.citas.length > 0);
  const horasSemana = [...new Set(columnas.flatMap((dia) => dia.bloques.map((bloque) => bloque.hora)))].sort();

  return (
    <section className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">{titulo}</h1>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex rounded-full border border-line bg-white p-1 shadow-sm" role="tablist" aria-label="Vista del calendario">
            {(["dia", "semana", "mes"] as const).map((opcion) => (
              <button key={opcion} type="button" role="tab" aria-selected={vista === opcion} className={`rounded-full px-3 py-1.5 text-sm transition-colors ${vista === opcion ? "bg-[#1e283c] text-white" : "text-muted hover:text-ink"}`} onClick={() => setVista(opcion)}>
                {opcion === "dia" ? "Día" : opcion === "semana" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
          {vista === "mes" ? (
            <div className="flex items-center gap-2">
              <button type="button" className="h-10 w-10 rounded-lg border border-line bg-white" aria-label="Mes anterior" onClick={() => setFecha(sumar(fecha, -28).slice(0, 7) + "-01")}>‹</button>
              <p className="min-w-36 text-center text-sm font-semibold">{mesLegible(fecha)}</p>
              <button type="button" className="h-10 w-10 rounded-lg border border-line bg-white" aria-label="Mes siguiente" onClick={() => setFecha(sumar(fecha, 32).slice(0, 7) + "-01")}>›</button>
            </div>
          ) : (
            <Fecha id="fecha-agenda" etiqueta="Día" valor={fecha} alCambiar={setFecha} />
          )}
        </div>
      </div>
      {error ? <Aviso>{error}</Aviso> : null}

      {vista === "mes" ? (
        mes === null && !error ? <Esqueleto /> : (
          <CalendarioMes mes={fecha.slice(0, 7)} dias={mes ?? []} laborables={laborables} onElegir={(dia) => { setFecha(dia); setVista("dia"); }} />
        )
      ) : null}

      {vista === "semana" ? (
        semana.length === 0 ? <Esqueleto /> : columnas.length === 0 ? <Vacio texto="Sin cupos" /> : (
          <div className="superficie overflow-x-auto">
            <table className="w-full min-w-[40rem] border-collapse text-left text-xs">
              <caption className="sr-only">Semana de {titulo}</caption>
              <thead>
                <tr>
                  <th className="px-3 py-2 font-medium text-muted">Hora</th>
                  {columnas.map((dia) => (
                    <th key={dia.fecha} className={`px-2 py-2 ${dia.fecha === fechaHoy() ? "text-sky" : dia.fecha < fechaHoy() ? "font-normal text-[#a8aeb8]" : ""}`}>
                      {etiquetaCorta(dia.fecha)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {horasSemana.map((hora) => (
                  <tr key={hora} className="border-t border-line">
                    <th scope="row" className="px-3 py-1 font-medium text-muted">{hora}</th>
                    {columnas.map((dia) => {
                      const bloque = dia.bloques.find((item) => item.hora === hora);
                      const personas = dia.citas.filter((cita) => cita.hora === hora);
                      return (
                        <td key={dia.fecha} className="px-1 py-1">
                          {bloque ? (
                            <button
                              type="button"
                              title={personas.length ? personas.map((cita) => cita.nombre).join(", ") : "Libre"}
                              disabled={dia.fecha < fechaHoy()}
                              className={`flex min-h-10 w-full flex-col justify-center gap-0.5 rounded-md px-1.5 py-1 text-left text-[11px] leading-tight transition-colors ${personas[0] ? tonoEstado(personas[0].estado) : "bg-transparent text-transparent hover:bg-[#f3efe9]"} ${dia.fecha < fechaHoy() ? "opacity-45" : ""} ${dia.fecha === fechaHoy() && personas.length ? "ring-1 ring-pine" : ""}`}
                              onClick={() => { setFecha(dia.fecha); setVista("dia"); }}
                            >
                              {personas.map((cita) => nombreCorto(cita.nombre)).join(" · ")}
                            </button>
                          ) : <span className="block h-10" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {vista === "dia" ? (
        <>
          {!bloques && !error ? <Esqueleto /> : null}
          {bloques && bloques.length === 0 ? <Vacio texto="Sin cupos" /> : null}
          {bloques && bloques.length > 0 ? (
            <div className="superficie overflow-hidden">
              {bloques.map((bloque) => {
                const libres = Math.max(0, bloque.capacidad - bloque.usados);
                const personas = citas.filter((cita) => cita.hora === bloque.hora);
                const pasado = fecha < fechaHoy();
                return (
                  <div
                    key={bloque.hora}
                    className={`grid grid-cols-[4.5rem_1fr] border-t border-line first:border-t-0 ${pasado ? "opacity-55" : ""}`}
                    onDragOver={(evento) => { if (puedeReservar) evento.preventDefault(); }}
                    onDrop={(evento) => {
                      evento.preventDefault();
                      const id = evento.dataTransfer.getData("text/plain");
                      void mover(id, bloque.hora);
                    }}
                  >
                    <div className="px-3 pt-2 text-xs font-medium text-muted tabular-nums">{bloque.hora}</div>
                    <div
                      className="grid gap-1 py-1 pr-2"
                      style={{ gridTemplateColumns: `repeat(${Math.max(personas.length, 1)}, minmax(0, 1fr))` }}
                    >
                      {personas.map((cita) => (
                        <Link key={cita.id} to={`/citas/${cita.id}`} aria-label={`${nombreCorto(cita.nombre)}, ${cita.estado === "AGENDADA" ? "agendada" : cita.estado === "ASISTIO" ? "asistió" : cita.estado === "NO_ASISTIO" ? "no asistió" : cita.estado === "ATRASADO" ? "atrasado" : cita.estado}`} className={`flex min-h-11 items-center rounded-md px-2.5 py-1 text-sm transition-transform hover:-translate-y-px ${tonoEstado(cita.estado)}`}>
                          <span className="truncate font-medium">{nombreCorto(cita.nombre)}</span>
                        </Link>
                      ))}
                      {personas.length === 0 && puedeReservar && libres > 0 && fecha >= fechaHoy() ? (
                        <Link aria-label={`Reservar ${bloque.hora}`} className="flex min-h-11 items-center rounded-md px-2.5 text-xs text-transparent transition-colors hover:bg-[#f3efe9] hover:text-muted focus-visible:text-muted" to={`/citas/nueva?agenda=${agenda}&fecha=${fecha}&hora=${bloque.hora}`}>
                          Reservar
                        </Link>
                      ) : personas.length === 0 ? <span className="block min-h-11" /> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
          <div>
            <h2 className="text-xl font-semibold">Citas de este día</h2>
            <div className="mt-3">
              <Tabla
                etiqueta={`Citas de ${titulo} el ${fecha}`}
                vacio="Sin citas"
                filas={citas}
                columnas={[
                  { id: "hora", titulo: "Hora", valor: (cita) => cita.hora, celda: (cita) => (
                    <span draggable={puedeReservar && cita.estado === "AGENDADA"} onDragStart={(evento) => evento.dataTransfer.setData("text/plain", cita.id)} className={puedeReservar && cita.estado === "AGENDADA" ? "cursor-grab" : ""}>{cita.hora}</span>
                  ) },
                  { id: "nombre", titulo: "Persona", valor: (cita) => cita.nombre },
                  { id: "tramite", titulo: "Trámite", valor: (cita) => cita.tramite },
                  { id: "estado", titulo: "Estado", valor: (cita) => cita.estado, celda: (cita) => <Estado valor={cita.estado} /> },
                  { id: "accion", titulo: "Acción", valor: () => "Abrir", celda: (cita) => (
                    <span className="flex flex-wrap items-center gap-2">
                      <Link className="underline" to={`/citas/${cita.id}`}>Abrir</Link>
                      {puedeReservar && cita.estado === "AGENDADA" && bloques ? (
                        <label className="text-xs">Mover
                          <select className="ml-1 rounded-md border border-line" value={moviendo} onChange={(e) => { setMoviendo(""); void mover(cita.id, e.target.value); }}>
                            <option value="">horario</option>
                            {bloques.filter((bloque) => bloque.hora !== cita.hora && bloque.usados < bloque.capacidad).map((bloque) => (
                              <option key={bloque.hora} value={bloque.hora}>{bloque.hora}</option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                    </span>
                  ) },
                ]}
              />
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
