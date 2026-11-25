import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, fechaHumana } from "../api";
import { textoFecha } from "../fecha";
import { useAuth } from "../auth";
import { Aviso, Estado, Esqueleto } from "../ui";
import { useVivo } from "../vivo";
import { Camara, comprimirArchivo } from "./escaner";

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
  resultado?: string | null;
  tramite?: string;
  clases?: string;
  email?: string | null;
  telefono?: string | null;
  atencion_at?: string | null;
  documentosTexto?: string;
  direccion?: string;
}
interface Otra { id: string; fecha: string; hora: string; estado: string; tramite: string }
interface Hueco { fecha: string; hora: string; libres: number }

const TIPOS = [
  ["FOTO_CIUDADANO", "Foto persona"],
  ["CEDULA", "Cédula"],
  ["DOCUMENTO", "Documento"],
] as const;

export function CitaDetalle() {
  const { id = "" } = useParams();
  const { usuario } = useAuth();
  const dialogo = useRef<HTMLDialogElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [cita, setCita] = useState<Cita | null>(null);
  const [otras, setOtras] = useState<Otra[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [masHoras, setMasHoras] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number][0]>("FOTO_CIUDADANO");
  const [camara, setCamara] = useState(false);
  const [huecos, setHuecos] = useState<Hueco[]>([]);
  const pagina = useRef(1);

  const cargar = useCallback(() => {
    void api<{ cita: Cita; documentos: Documento[]; otras?: Otra[] }>(`/api/citas/${id}`)
      .then((datos) => {
        setCita(datos.cita);
        setOtras(datos.otras ?? []);
        setDocumentos((datos.documentos ?? []).filter((doc) => doc.vigente === 1));
      })
      .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se encontró la cita."));
  }, [id]);

  useEffect(() => {
    document.title = "Cita · Licencias Recoleta";
    cargar();
  }, [cargar]);

  useVivo(useCallback((evento) => {
    if (!evento.citaId || evento.citaId === id) cargar();
  }, [cargar, id]));

  useEffect(() => {
    if (!cita || cita.estado !== "AGENDADA") return;
    const agenda = cita.agenda_id === "PRIMERA_VEZ" ? "PRIMERA_VEZ" : "GENERAL";
    void api<{ agendas: { siguientes: Hueco[] }[] }>(`/api/huecos?agenda=${agenda}&desde=${cita.fecha}&limite=16`)
      .then((datos) => setHuecos((datos.agendas[0]?.siguientes ?? []).filter((hueco) => !(hueco.fecha === cita.fecha && hueco.hora === cita.hora))))
      .catch(() => setHuecos([]));
  }, [cita]);

  async function subir(blob: Blob, paginaDoc = 1) {
    setError("");
    const respuesta = await fetch(`/api/citas/${id}/foto?tipo=${tipo}&pagina=${paginaDoc}`, {
      method: "POST",
      headers: { "content-type": "image/jpeg", "x-csrf-token": csrf() },
      body: blob,
      credentials: "same-origin",
    });
    const datos = await respuesta.json() as { mensaje?: string };
    if (!respuesta.ok) throw new Error(datos.mensaje ?? "No se pudo subir.");
    cargar();
  }

  async function desdeArchivo(file: File | undefined) {
    if (!file) return;
    try {
      const blob = tipo === "DOCUMENTO" || tipo === "CEDULA" ? await comprimirArchivo(file) : await comprimirArchivo(file);
      await subir(blob, tipo === "DOCUMENTO" ? pagina.current : 1);
      if (tipo === "DOCUMENTO") pagina.current += 1;
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo subir.");
    }
  }

  async function mover(hora: string, fecha: string) {
    setError("");
    try {
      await api(`/api/citas/${id}/reagendar`, { method: "POST", body: { fecha, hora } });
      cargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo reagendar.");
    }
  }

  async function asistencia(estado: string) {
    setError("");
    try {
      await api(`/api/citas/${id}/asistencia`, { method: "POST", body: { estado } });
      cargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo marcar.");
    }
  }

  async function resultado(valor: string) {
    setError("");
    try {
      await api(`/api/citas/${id}/resultado`, { method: "POST", body: { resultado: valor } });
      cargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo guardar.");
    }
  }

  async function cancelar() {
    setError("");
    try {
      await api(`/api/citas/${id}/cancelar`, { method: "POST", body: { motivo } });
      dialogo.current?.close();
      cargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo cancelar.");
    }
  }

  if (error && !cita) return <Aviso>{error}</Aviso>;
  if (!cita) return <Esqueleto />;

  const instructor = usuario?.rol === "INSTRUCTOR" || usuario?.rol === "ADMIN";
  const puedeMover = usuario?.rol === "ADMIN" || usuario?.rol === "OPERADOR_AGENDA";
  const puedeAsistencia = usuario?.rol === "ADMIN" || usuario?.rol === "OPERADOR_AGENDA" || usuario?.rol === "RECEPCION" || (usuario?.rol === "INSTRUCTOR" && cita.agenda_id === "PRIMERA_VEZ");

  return (
    <article className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="grid content-start gap-5 rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.04)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-[26px] font-semibold tracking-tight">{cita.nombres} {cita.apellidos}</h1>
            <p className="mt-1 text-sm text-muted">{cita.rutVisible ?? cita.rut}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Estado valor={cita.estado} />
            <button type="button" className="btn border border-line bg-white" onClick={() => window.print()}>Imprimir</button>
            <a className="btn border border-line bg-white" href={`/api/citas/${cita.id}/comprobante.pdf`} target="_blank" rel="noreferrer">PDF</a>
          </div>
        </div>
        <section className="comprobante">
          <p>Municipalidad de Recoleta · Dirección de Tránsito</p>
          <p>{cita.nombres} {cita.apellidos}</p>
          <p>{cita.rutVisible ?? cita.rut}</p>
          <p>{fechaHumana(cita.fecha)} · {cita.hora}</p>
          <p>{cita.tramite ?? ""}</p>
          <p>{cita.agenda_id === "PRIMERA_VEZ" ? "Primera vez" : "General"}</p>
          <p>Documentos: {cita.documentosTexto ?? "cédula de identidad"}</p>
          {cita.direccion ? <p>{cita.direccion}</p> : null}
        </section>
        <p className="text-lg font-medium">{fechaHumana(cita.fecha)} · {cita.hora}</p>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-muted">Trámite</dt><dd className="font-medium">{cita.tramite ?? "—"}</dd></div>
          <div><dt className="text-muted">Clases</dt><dd className="font-medium">{clasesDe(cita.clases)}</dd></div>
          <div><dt className="text-muted">Agenda</dt><dd className="font-medium">{cita.agenda_id === "PRIMERA_VEZ" ? "Primera vez" : "General"}{cita.resultado ? ` · ${cita.resultado === "APROBADO" ? "Aprobado" : "Reprobado"}` : ""}</dd></div>
          <div><dt className="text-muted">Documentos</dt><dd className="font-medium">{cita.documentosTexto ?? "cédula de identidad"}</dd></div>
          {cita.direccion ? <div><dt className="text-muted">Dirección</dt><dd className="font-medium">{cita.direccion}</dd></div> : null}
          {cita.email ? <div><dt className="text-muted">Correo</dt><dd className="font-medium">{cita.email}</dd></div> : null}
          {cita.telefono ? <div><dt className="text-muted">Teléfono</dt><dd className="font-medium">{cita.telefono}</dd></div> : null}
        </dl>
        {error ? <Aviso>{error}</Aviso> : null}
        {puedeAsistencia && cita.estado === "AGENDADA" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-11 rounded-lg bg-[#1e283c] px-4 text-sm font-semibold text-white" onClick={() => void asistencia("ASISTIO")}>Asistió</button>
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void asistencia("ATRASADO")}>Atrasado</button>
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void asistencia("NO_ASISTIO")}>No asistió</button>
          </div>
        ) : null}
        {puedeAsistencia && (cita.estado === "ASISTIO" || cita.estado === "ATRASADO" || cita.estado === "NO_ASISTIO") ? (
          <div className="flex flex-wrap gap-2">
            {(cita.estado === "ASISTIO" || cita.estado === "ATRASADO") && !cita.atencion_at ? (
              <button type="button" className="h-11 rounded-lg bg-pine px-4 text-sm font-semibold text-white" onClick={() => void api(`/api/citas/${id}/atencion`, { method: "POST", body: {} }).then(() => cargar()).catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo marcar."))}>Atendido</button>
            ) : null}
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void asistencia("AGENDADA")}>{cita.estado === "NO_ASISTIO" ? "Deshacer" : "Deshacer llegada"}</button>
          </div>
        ) : null}
        {instructor && cita.agenda_id === "PRIMERA_VEZ" ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void resultado("APROBADO")}>Aprobado</button>
            <button type="button" className="h-11 rounded-lg border border-line px-4 text-sm font-semibold" onClick={() => void resultado("REPROBADO")}>Reprobado</button>
          </div>
        ) : null}
        {puedeMover && cita.estado === "AGENDADA" ? (
          <div className="grid gap-2">
            <h2 className="text-sm font-semibold">Reagendar</h2>
            <div className="flex flex-wrap gap-2">
              {(masHoras ? huecos : huecos.slice(0, 4)).map((hueco) => (
                <button key={`${hueco.fecha}-${hueco.hora}`} type="button" className="h-10 rounded-full border border-line bg-white px-3 text-sm hover:bg-paper" onClick={() => void mover(hueco.hora, hueco.fecha)}>
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
          <button type="button" className="justify-self-start text-sm font-medium text-alert" onClick={() => dialogo.current?.showModal()}>Cancelar</button>
        ) : null}
        <div className="grid gap-2 border-t border-line pt-4">
          <h2 className="text-sm font-semibold">Historial</h2>
          {otras.length === 0 ? <p className="text-sm text-muted">Sin citas</p> : (
            <ul className="grid gap-2">
              {otras.map((otra) => (
                <li key={otra.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span>{textoFecha(otra.fecha).slice(0, 5)} {otra.hora} · {otra.tramite}</span>
                  <Estado valor={otra.estado} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      <section className="grid content-start gap-4 rounded-2xl border border-line bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,.04)]">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-paper p-1" role="tablist">
          {TIPOS.map(([valor, etiqueta]) => (
            <button key={valor} type="button" role="tab" aria-selected={tipo === valor} className={`h-10 rounded-lg text-sm font-medium ${tipo === valor ? "bg-white shadow-sm" : "text-muted"}`} onClick={() => setTipo(valor)}>
              {etiqueta}
            </button>
          ))}
        </div>
        <button type="button" className="h-14 rounded-xl bg-[#1e283c] text-base font-semibold text-white" onClick={() => setCamara(true)}>Cámara</button>
        <button type="button" className="h-14 rounded-xl border border-line text-base font-semibold" onClick={() => archivo.current?.click()}>Archivo</button>
        <input ref={archivo} className="sr-only" type="file" accept="image/*" aria-label="Archivo" onChange={(e) => void desdeArchivo(e.target.files?.[0])} />
        <ul className="grid gap-3">
          {documentos.map((doc) => (
            <li key={doc.id}>
              <img src={`/api/documentos/${doc.id}/contenido`} alt={nombreDoc(doc.tipo)} className="max-h-56 w-full rounded-xl border border-line object-contain" />
              <p className="mt-1 text-xs text-muted">{nombreDoc(doc.tipo)}{doc.pagina > 1 ? ` ${doc.pagina}` : ""}</p>
            </li>
          ))}
        </ul>
      </section>
      <Camara
        abierto={camara}
        onCerrar={() => setCamara(false)}
        onCaptura={(blob) => {
          const n = tipo === "DOCUMENTO" ? pagina.current : 1;
          if (tipo === "DOCUMENTO") pagina.current += 1;
          void subir(blob, n).catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo subir."));
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

function nombreDoc(tipo: string): string {
  if (tipo === "FOTO_CIUDADANO") return "Foto persona";
  if (tipo === "CEDULA") return "Cédula";
  if (tipo === "DOCUMENTO") return "Documento";
  return tipo;
}

function csrf(): string {
  const par = document.cookie.split("; ").find((item) => item.startsWith("lic_csrf="));
  return par ? decodeURIComponent(par.slice("lic_csrf=".length)) : "";
}
