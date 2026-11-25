import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, fechaHoy } from "../api";
import { mascaraRut } from "../../../src/domain/rut";
import { Estado, avisar } from "../ui";
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
}
interface Lista {
  fecha: string;
  citas: Cita[];
  contadores: { total: number; confirmadas: number; pendientes: number; noAsistieron: number };
}

const ESTADOS = [
  ["", "Todas"],
  ["AGENDADA", "Por llegar"],
  ["ASISTIO", "Llegó"],
  ["ATRASADO", "Atrasado"],
  ["NO_ASISTIO", "No asistió"],
] as const;

export function Atencion() {
  const hoy = fechaHoy();
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

  const citas = (datos?.citas ?? []).filter((cita) => !estado || cita.estado === estado);
  const proxima = citas.find((cita) => cita.estado === "AGENDADA") ?? citas[0];
  const activa = citas.find((cita) => cita.id === elegida) ?? proxima;

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
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="page-title">Atención del día</h1>
        <p className="text-sm text-muted">{hoy.split("-").reverse().join("-")}</p>
      </div>
      {error ? <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-alert">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Contador etiqueta="Citadas" valor={contadores?.total ?? 0} />
        <Contador etiqueta="Llegaron" valor={contadores?.confirmadas ?? 0} />
        <Contador etiqueta="Faltan" valor={contadores?.pendientes ?? 0} />
        <Contador etiqueta="Inasistencias" valor={contadores?.noAsistieron ?? 0} />
      </div>
      <div className="flex flex-wrap gap-2">
        {[["", "Ambas"], ["GENERAL", "General"], ["PRIMERA_VEZ", "Primera vez"]].map(([id, texto]) => (
          <button key={id || "todas"} type="button" aria-pressed={agenda === id} className={`min-h-11 rounded-full px-4 text-sm font-semibold ${agenda === id ? "bg-pine text-white" : "border border-line bg-white"}`} onClick={() => setAgenda(id)}>{texto}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">Buscar</span>
          <input autoFocus className="h-12 w-full rounded-lg border border-line px-3 text-base" placeholder="RUT o nombre" value={q} onChange={(e) => setQ(/\d/.test(e.target.value) ? mascaraRut(e.target.value) : e.target.value)} />
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
                <button type="button" aria-pressed={activa?.id === cita.id} className={`grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-3 py-3 text-left ${cita.estado === "AGENDADA" && cita.id === proxima?.id ? "bg-[#eef3ff]" : ""} ${activa?.id === cita.id ? "bg-[#f4f7fb]" : ""}`} onClick={() => setElegida(cita.id)}>
                  <span className="text-lg font-semibold tabular-nums">{cita.hora}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{cita.nombre}</span>
                    <span className="block truncate text-sm text-muted">{cita.tramite}</span>
                  </span>
                  <Estado valor={cita.estado} />
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
            <Estado valor={activa.estado} />
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
                <button type="button" className="min-h-12 rounded-lg bg-pine text-base font-semibold text-white" disabled={ocupado} onClick={() => void api(`/api/citas/${activa.id}/atencion`, { method: "POST", body: {} }).then(() => avisar("Atención registrada.")).catch((falla: unknown) => avisar(falla instanceof Error ? falla.message : "No se pudo marcar.", "error"))}>Atendido</button>
              ) : null}
            </div>
            <Link className="text-sm font-semibold text-sky" to={`/citas/${activa.id}`}>Abrir ficha</Link>
          </aside>
        ) : null}
      </div>
    </section>
  );
}

function Contador({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <article className="superficie px-3 py-3">
      <p className="text-xs font-medium text-muted">{etiqueta}</p>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
    </article>
  );
}
