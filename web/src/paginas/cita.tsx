import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, fechaHumana } from "../api";
import { textoFecha } from "../fecha";
import { useAuth } from "../auth";
import { Camera } from "lucide-react";
import { Aviso, Docs, Estado, Esqueleto } from "../ui";
import { useVivo } from "../vivo";
import { etiquetaIntento, resultadoDeIntento } from "../../../src/domain/examen";
import { Camara } from "./escaner";

interface Documento { id: string; tipo: string; bytes: number; subido_at: string; vigente: number; pagina: number }
interface Cita {
  id: string;
  estado: string;
  fecha: string;
  hora: string;
  nombres: string;
  apellidos: string;
  rut: string;
  rutVisible?: string;
  agenda_id: string;
  es_sobrecupo?: number;
  resultado?: string | null;
  tramite?: string;
  clases?: string;
  email?: string | null;
  telefono?: string | null;
  atencion_at?: string | null;
  documentosTexto?: string;
  direccion?: string;
  tipo_tramite_id?: string;
}
interface IntentoExamen { id: string; fecha: string; hora: string; estado: string; resultado?: string | null }
interface Examen {
  habilitado: boolean;
  codigo?: string;
  mensaje?: string;
  examenActivo?: { id: string; fecha: string; hora: string };
  intentos: IntentoExamen[];
}
interface Otra { id: string; fecha: string; hora: string; estado: string; tramite: string }
interface Hueco { fecha: string; hora: string; libres: number }
interface Ficha { cita: Cita; documentos: Documento[]; otras?: Otra[]; requeridos?: string[]; faltantes?: string[]; comprobante?: boolean; examen?: Examen }
type Subida = { estado: "subiendo" } | { estado: "error"; mensaje: string; blob: Blob };

const EXTRAS = [
  ["FOTO_CIUDADANO", "Foto persona"],
  ["DOCUMENTO", "Otro documento"],
] as const;

export const NOMBRE_DOC: Record<string, string> = {
  CARNET_FRENTE: "Carnet, frente",
  CARNET_REVERSO: "Carnet, reverso",
  LICENCIA_FRENTE: "Licencia, frente",
  LICENCIA_REVERSO: "Licencia, reverso",
  FOTO_CIUDADANO: "Foto persona",
  CEDULA: "Cédula",
  DOCUMENTO: "Documento",
};

export function CitaDetalle() {
  const { id = "" } = useParams();
  const { usuario } = useAuth();
  const dialogo = useRef<HTMLDialogElement>(null);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [masHoras, setMasHoras] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [camara, setCamara] = useState<string | null>(null);
  const [subidas, setSubidas] = useState<Record<string, Subida>>({});
  const [huecos, setHuecos] = useState<Hueco[]>([]);
  const [recienCompleta, setRecienCompleta] = useState(false);
  const pagina = useRef(1);
  const comprobantePrevio = useRef<boolean | null>(null);
  const encadenar = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const datos = await api<Ficha>(`/api/citas/${id}`);
      setFicha(datos);
      const listo = Boolean(datos.comprobante) && (datos.requeridos?.length ?? 0) > 0;
      if (comprobantePrevio.current === false && listo) setRecienCompleta(true);
      comprobantePrevio.current = Boolean(datos.comprobante);
      return datos;
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se encontró la cita.");
      return null;
    }
  }, [id]);

  useEffect(() => {
    document.title = "Cita · Licencias Recoleta";
    comprobantePrevio.current = null;
    void cargar();
  }, [cargar]);

  useVivo(useCallback((evento) => {
    if (!evento.citaId || evento.citaId === id) void cargar();
  }, [cargar, id]));

  const cita = ficha?.cita ?? null;
  useEffect(() => {
    if (!cita || cita.estado !== "AGENDADA") return;
    const agenda = cita.agenda_id === "PRIMERA_VEZ" ? "PRIMERA_VEZ" : "GENERAL";
    void api<{ agendas: { siguientes: Hueco[] }[] }>(`/api/huecos?agenda=${agenda}&desde=${cita.fecha}&limite=16`)
      .then((datos) => setHuecos((datos.agendas[0]?.siguientes ?? []).filter((hueco) => !(hueco.fecha === cita.fecha && hueco.hora === cita.hora))))
      .catch(() => setHuecos([]));
  }, [cita]);

  const subir = useCallback(async (tipo: string, blob: Blob) => {
    setSubidas((prev) => ({ ...prev, [tipo]: { estado: "subiendo" } }));
    const paginaDoc = tipo === "DOCUMENTO" ? pagina.current : 1;
    try {
      const respuesta = await fetch(`/api/citas/${id}/foto?tipo=${tipo}&pagina=${paginaDoc}`, {
        method: "POST",
        headers: { "content-type": "image/jpeg", "x-csrf-token": csrf() },
        body: blob,
        credentials: "same-origin",
      });
      const datos = await respuesta.json().catch(() => ({})) as { mensaje?: string; faltantes?: string[] };
      if (!respuesta.ok) throw new Error(datos.mensaje ?? "No se pudo subir.");
      if (tipo === "DOCUMENTO") pagina.current += 1;
      setSubidas((prev) => { const copia = { ...prev }; delete copia[tipo]; return copia; });
      const nueva = await cargar();
      const siguiente = nueva?.faltantes?.[0];
      if (encadenar.current && siguiente) setCamara(siguiente);
      else encadenar.current = false;
    } catch (falla) {
      const mensaje = !navigator.onLine ? "Sin conexión" : falla instanceof Error ? falla.message : "No se pudo subir.";
      setSubidas((prev) => ({ ...prev, [tipo]: { estado: "error", mensaje, blob } }));
      encadenar.current = false;
    }
  }, [cargar, id]);

  useEffect(() => {
    const reintentar = () => {
      for (const [tipo, subida] of Object.entries(subidas)) if (subida.estado === "error") void subir(tipo, subida.blob);
    };
    window.addEventListener("online", reintentar);
    return () => window.removeEventListener("online", reintentar);
  }, [subidas, subir]);

  async function accion(ruta: string, body: Record<string, unknown>, falla: string) {
    setError("");
    try {
      await api(`/api/citas/${id}/${ruta}`, { method: "POST", body });
      void cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : falla);
    }
  }

  async function cancelar() {
    setError("");
    try {
      await api(`/api/citas/${id}/cancelar`, { method: "POST", body: { motivo } });
      dialogo.current?.close();
      void cargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo cancelar.");
    }
  }

  if (error && !ficha) return <Aviso>{error}</Aviso>;
  if (!ficha || !cita) return <Esqueleto />;

  const rol = usuario?.rol;
  const instructor = rol === "INSTRUCTOR" || rol === "ADMIN";
  const puedeMover = rol === "ADMIN" || rol === "OPERADOR_AGENDA";
  const puedeAsistencia = rol === "ADMIN" || rol === "OPERADOR_AGENDA" || rol === "RECEPCION" || (rol === "INSTRUCTOR" && cita.agenda_id === "PRIMERA_VEZ");
  const puedeFotos = rol === "ADMIN" || rol === "OPERADOR_AGENDA" || rol === "RECEPCION" || (rol === "INSTRUCTOR" && cita.agenda_id === "PRIMERA_VEZ");
  const requeridos = ficha.requeridos ?? [];
  const faltantes = ficha.faltantes ?? [];
  const vigentes = ficha.documentos.filter((doc) => doc.vigente === 1);
  const ultimo = (tipo: string) => [...vigentes].reverse().find((doc) => doc.tipo === tipo);
  const extras = vigentes.filter((doc) => !requeridos.includes(doc.tipo));
  const comprobante = Boolean(ficha.comprobante);
  const pdf = `/api/citas/${cita.id}/comprobante.pdf`;

  function abrirCamara(tipo: string) {
    encadenar.current = requeridos.includes(tipo) && faltantes.includes(tipo);
    setRecienCompleta(false);
    setCamara(tipo);
  }

  return (
    <article className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="superficie grid content-start gap-4 p-4 sm:p-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{cita.nombres} {cita.apellidos}</h1>
            <p className="mt-0.5 text-sm text-muted tabular-nums">{cita.rutVisible ?? cita.rut} · {fechaHumana(cita.fecha)} · {cita.hora}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Estado valor={cita.estado} />
            {comprobante ? (
              <a className="btn border border-line bg-white" href={pdf} target="_blank" rel="noreferrer">Comprobante</a>
            ) : (
              <button type="button" disabled className="btn cursor-not-allowed border border-line bg-paper text-muted" title={`Faltan: ${faltantes.map((tipo) => NOMBRE_DOC[tipo] ?? tipo).join(", ")}`}>Comprobante</button>
            )}
          </div>
        </header>

        {requeridos.length > 0 ? (
          <section aria-labelledby="docs-titulo" className="grid gap-2">
            <div className="flex items-center justify-between gap-2">
              <h2 id="docs-titulo" className="text-sm font-semibold">Documentos</h2>
              <Docs cargados={requeridos.length - faltantes.length} requeridos={requeridos.length} />
            </div>
            {recienCompleta && comprobante ? (
              <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#e5f6ec] px-3 py-2 text-sm font-semibold text-[#146c43]">
                Documentos completos
                <a className="btn bg-[#146c43] text-white" href={pdf} target="_blank" rel="noreferrer" onClick={() => setRecienCompleta(false)}>Emitir comprobante</a>
              </div>
            ) : null}
            <ul className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {requeridos.map((tipo) => {
                const doc = ultimo(tipo);
                const subida = subidas[tipo];
                return (
                  <li key={tipo} className={`grid overflow-hidden rounded-xl border ${doc ? "border-[#bfe3cd]" : "border-[#f1d3a6]"} bg-white`}>
                    <button
                      type="button"
                      disabled={!puedeFotos || subida?.estado === "subiendo"}
                      onClick={() => abrirCamara(tipo)}
                      aria-label={`${doc ? "Reemplazar" : "Fotografiar"} ${NOMBRE_DOC[tipo] ?? tipo}`}
                      className="relative grid aspect-[85.6/54] w-full place-items-center bg-paper disabled:cursor-default"
                    >
                      {doc ? (
                        <img src={`/api/documentos/${doc.id}/contenido`} alt={NOMBRE_DOC[tipo] ?? tipo} className="absolute inset-0 h-full w-full object-cover" />
                      ) : (
                        <Camera size={30} className="text-[#9a5b00]" aria-hidden />
                      )}
                      {subida?.estado === "subiendo" ? <span className="absolute inset-0 grid place-items-center bg-white/70 text-sm font-semibold">Subiendo…</span> : null}
                      <span className={`absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold shadow-sm ${doc ? "bg-[#e5f6ec] text-[#146c43]" : "bg-[#fff1dc] text-[#9a5b00]"}`}>{doc ? "Listo" : "Falta"}</span>
                    </button>
                    <p className="truncate px-2.5 py-2 text-sm font-semibold">{NOMBRE_DOC[tipo] ?? tipo}</p>
                    {subida?.estado === "error" ? (
                      <div className="flex items-center justify-between gap-2 border-t border-line px-2.5 py-2">
                        <span role="alert" className="min-w-0 truncate text-xs font-semibold text-alert">{subida.mensaje}</span>
                        <button type="button" className="h-9 shrink-0 rounded-lg bg-alert px-3 text-sm font-semibold text-white" onClick={() => void subir(tipo, subida.blob)}>Reintentar</button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {puedeFotos && faltantes.length > 0 ? (
              <button type="button" className="flex h-14 items-center justify-center gap-2 rounded-xl bg-pine text-base font-semibold text-white" onClick={() => abrirCamara(faltantes[0])}>
                <Camera size={20} aria-hidden /> {NOMBRE_DOC[faltantes[0]] ?? faltantes[0]}
              </button>
            ) : null}
          </section>
        ) : null}

        {error ? <Aviso>{error}</Aviso> : null}

        {puedeAsistencia && cita.estado === "AGENDADA" ? (
          <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap">
            <button type="button" className="h-11 rounded-lg bg-[#1e283c] px-4 text-sm font-semibold text-white" onClick={() => void accion("asistencia", { estado: "ASISTIO" }, "No se pudo marcar.")}>Asistió</button>
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void accion("asistencia", { estado: "ATRASADO" }, "No se pudo marcar.")}>Atrasado</button>
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void accion("asistencia", { estado: "NO_ASISTIO" }, "No se pudo marcar.")}>No asistió</button>
          </div>
        ) : null}
        {puedeAsistencia && (cita.estado === "ASISTIO" || cita.estado === "ATRASADO" || cita.estado === "NO_ASISTIO") ? (
          <div className="flex flex-wrap gap-2">
            {(cita.estado === "ASISTIO" || cita.estado === "ATRASADO") && !cita.atencion_at ? (
              <button type="button" className="h-11 rounded-lg bg-pine px-4 text-sm font-semibold text-white" onClick={() => void accion("atencion", {}, "No se pudo marcar.")}>Atendido</button>
            ) : null}
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void accion("asistencia", { estado: "AGENDADA" }, "No se pudo marcar.")}>{cita.estado === "NO_ASISTIO" ? "Deshacer" : "Deshacer llegada"}</button>
          </div>
        ) : null}
        {instructor && cita.agenda_id === "PRIMERA_VEZ" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void accion("resultado", { resultado: "APROBADO" }, "No se pudo guardar.")}>Aprobado</button>
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void accion("resultado", { resultado: "REPROBADO" }, "No se pudo guardar.")}>Reprobado</button>
          </div>
        ) : null}
        {puedeMover && ficha.examen?.habilitado && cita.agenda_id === "GENERAL" ? (
          <Link className="btn bg-pine text-white" to={`/citas/nueva?agenda=primera_vez&rut=${encodeURIComponent(cita.rut)}&volver=/agenda/primera_vez`}>Agendar examen práctico</Link>
        ) : null}
        {puedeMover && ficha.examen?.habilitado && cita.agenda_id === "PRIMERA_VEZ" && (resultadoDeIntento(cita) === "REPROBADO" || resultadoDeIntento(cita) === "NO_ASISTIO") ? (
          <Link className="btn bg-pine text-white" to={`/citas/nueva?agenda=primera_vez&rut=${encodeURIComponent(cita.rut)}&volver=/agenda/primera_vez`}>Reagendar examen</Link>
        ) : null}
        {ficha.examen?.examenActivo && ficha.examen.examenActivo.id !== cita.id ? (
          <Link className="text-sm font-semibold text-sky underline" to={`/citas/${ficha.examen.examenActivo.id}`}>Examen práctico {ficha.examen.examenActivo.fecha} {ficha.examen.examenActivo.hora}</Link>
        ) : null}

        <dl className="grid gap-x-4 gap-y-2 border-t border-line pt-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-muted">Trámite</dt><dd className="font-medium">{cita.tramite ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted">Clases</dt><dd className="font-medium">{clasesDe(cita.clases)}</dd></div>
          <div><dt className="text-xs text-muted">Agenda</dt><dd className="font-medium">{cita.agenda_id === "PRIMERA_VEZ" ? "Primera vez" : "General"}{cita.es_sobrecupo ? " · Sobrecupo" : ""}{cita.resultado ? ` · ${cita.resultado === "APROBADO" ? "Aprobado" : "Reprobado"}` : ""}</dd></div>
          {cita.direccion ? <div><dt className="text-xs text-muted">Dirección</dt><dd className="font-medium">{cita.direccion}</dd></div> : null}
          {cita.email ? <div><dt className="text-xs text-muted">Correo</dt><dd className="break-all font-medium">{cita.email}</dd></div> : null}
          {cita.telefono ? <div><dt className="text-xs text-muted">Teléfono</dt><dd className="font-medium">{cita.telefono}</dd></div> : null}
        </dl>

        {puedeMover && cita.estado === "AGENDADA" && huecos.length > 0 ? (
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Reagendar</h2>
            <div className="flex flex-wrap gap-2">
              {(masHoras ? huecos : huecos.slice(0, 4)).map((hueco) => (
                <button key={`${hueco.fecha}-${hueco.hora}`} type="button" className="h-10 rounded-full border border-line bg-white px-3 text-sm hover:bg-paper" onClick={() => void accion("reagendar", { fecha: hueco.fecha, hora: hueco.hora }, "No se pudo reagendar.")}>
                  {textoFecha(hueco.fecha).slice(0, 5)} {hueco.hora}
                </button>
              ))}
              {huecos.length > 4 && !masHoras ? (
                <button type="button" className="h-10 rounded-full bg-pine px-3 text-sm font-semibold text-white" onClick={() => setMasHoras(true)}>Ver más horas</button>
              ) : null}
            </div>
          </div>
        ) : null}
        {puedeMover && cita.estado === "AGENDADA" ? (
          <button type="button" className="justify-self-start text-sm font-medium text-alert" onClick={() => dialogo.current?.showModal()}>Cancelar cita</button>
        ) : null}
      </section>

      <aside className="grid content-start gap-4">
        {puedeFotos && requeridos.length > 0 ? (
          <section className="superficie grid gap-2 p-4">
            <h2 className="text-sm font-semibold">Otros documentos</h2>
            <div className="grid grid-cols-2 gap-2">
              {EXTRAS.map(([tipo, etiqueta]) => (
                <button key={tipo} type="button" className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-line text-sm font-semibold hover:bg-paper" onClick={() => abrirCamara(tipo)}>
                  <Camera size={16} aria-hidden /> {etiqueta}
                </button>
              ))}
            </div>
            {EXTRAS.map(([tipo]) => subidas[tipo]?.estado === "error" ? (
              <div key={tipo} className="flex items-center justify-between gap-2">
                <span role="alert" className="text-xs font-semibold text-alert">{(subidas[tipo] as { mensaje: string }).mensaje}</span>
                <button type="button" className="h-9 rounded-lg bg-alert px-3 text-sm font-semibold text-white" onClick={() => void subir(tipo, (subidas[tipo] as { blob: Blob }).blob)}>Reintentar</button>
              </div>
            ) : null)}
            {extras.length > 0 ? (
              <ul className="grid grid-cols-2 gap-2">
                {extras.map((doc) => (
                  <li key={doc.id}>
                    <img src={`/api/documentos/${doc.id}/contenido`} alt={NOMBRE_DOC[doc.tipo] ?? doc.tipo} className="aspect-[4/3] w-full rounded-lg border border-line object-cover" />
                    <p className="mt-0.5 truncate text-xs text-muted">{NOMBRE_DOC[doc.tipo] ?? doc.tipo}{doc.pagina > 1 ? ` ${doc.pagina}` : ""}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
        {(ficha.examen?.intentos ?? []).length > 0 ? (
          <section className="superficie grid gap-2 p-4">
            <h2 className="text-sm font-semibold">Examen práctico</h2>
            <ul className="grid gap-2">
              {ficha.examen!.intentos.map((intento) => (
                <li key={intento.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <Link className="font-medium text-sky underline" to={`/citas/${intento.id}`}>{textoFecha(intento.fecha).slice(0, 5)} {intento.hora}</Link>
                  <span className="text-sm font-semibold">{etiquetaIntento(intento)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <section className="superficie grid gap-2 p-4">
          <h2 className="text-sm font-semibold">Historial</h2>
          {(ficha.otras ?? []).length === 0 ? <p className="text-sm text-muted">Sin citas</p> : (
            <ul className="grid gap-2">
              {(ficha.otras ?? []).map((otra) => (
                <li key={otra.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{textoFecha(otra.fecha).slice(0, 5)} {otra.hora} · {otra.tramite}</span>
                  <Estado valor={otra.estado} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <Camara
        abierto={camara !== null}
        titulo={camara ? NOMBRE_DOC[camara] ?? camara : ""}
        onCerrar={() => { encadenar.current = false; setCamara(null); }}
        onCaptura={(blob) => {
          const tipo = camara;
          setCamara(null);
          if (tipo) void subir(tipo, blob);
        }}
      />
      <dialog ref={dialogo} className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl border border-line bg-white p-5 shadow-[var(--shadow-card)] backdrop:bg-[#141b2b]/40">
        <h2 className="text-lg font-semibold">Cancelar cita</h2>
        <label className="mt-3 grid gap-1 text-sm font-medium" htmlFor="motivo">Motivo
          <textarea id="motivo" className="min-h-24 rounded-lg border border-line px-3 py-2 font-normal" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} />
        </label>
        <div className="mt-4 flex gap-2">
          <button type="button" className="h-10 rounded-lg bg-alert px-4 text-sm font-semibold text-white" onClick={() => void cancelar()}>Confirmar cancelación</button>
          <button type="button" className="h-10 rounded-lg border border-line px-4 text-sm" onClick={() => dialogo.current?.close()}>Volver</button>
        </div>
      </dialog>
    </article>
  );
}

function clasesDe(valor: string | undefined): string {
  if (!valor) return "—";
  try {
    const lista = JSON.parse(valor) as unknown;
    if (Array.isArray(lista) && lista.length > 0) return lista.map(String).join(", ");
  } catch {
    if (valor.trim()) return valor;
  }
  return "—";
}

function csrf(): string {
  const par = document.cookie.split("; ").find((item) => item.startsWith("lic_csrf="));
  return par ? decodeURIComponent(par.slice("lic_csrf=".length)) : "";
}
