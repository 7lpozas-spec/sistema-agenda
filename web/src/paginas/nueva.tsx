import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, fechaHoy } from "../api";
import { useAuth } from "../auth";
import { Fecha } from "../fecha";
import { Aviso, Boton, Campo, claseCampo } from "../ui";

interface Tipo {
  id: string;
  nombre: string;
  requiere_agenda: number;
  agenda_id: "GENERAL" | "PRIMERA_VEZ" | null;
  orden: number;
}
interface Bloque { hora: string; capacidad: number; usados: number }

export function NuevaCita() {
  const { usuario } = useAuth();
  const [params] = useSearchParams();
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [tipoId, setTipoId] = useState("");
  const [fecha, setFecha] = useState(params.get("fecha") || fechaHoy());
  const [hora, setHora] = useState(params.get("hora") || "");
  const [bloques, setBloques] = useState<Bloque[]>([]);
  const [rut, setRut] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [email, setEmail] = useState("");
  const [sinCorreo, setSinCorreo] = useState(false);
  const [telefono, setTelefono] = useState("");
  const [nacimiento, setNacimiento] = useState("");
  const [licencia, setLicencia] = useState("");
  const [nacionalidad, setNacionalidad] = useState("Española");
  const [clases, setClases] = useState<string[]>(["B"]);
  const [domicilio, setDomicilio] = useState(false);
  const [error, setError] = useState("");
  const [creada, setCreada] = useState("");

  const tipo = tipos.find((item) => item.id === tipoId);
  useEffect(() => {
    document.title = "Nueva cita · Agendamiento Licencias";
    void api<{ tipos: Tipo[] }>("/api/tipos-tramite").then((datos) => {
      const propios = usuario?.rol === "INSTRUCTOR" ? [] : datos.tipos;
      const pedida = params.get("agenda");
      const preferido = propios.find((item) => pedida === "primera_vez" ? item.agenda_id === "PRIMERA_VEZ" : pedida === "general" ? item.id === "CONTROL_RENOVACION" : item.requiere_agenda === 1);
      setTipos(propios);
      setTipoId(preferido?.id ?? propios[0]?.id ?? "");
    }).catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo leer el catálogo."));
  }, [params, usuario?.rol]);

  useEffect(() => {
    if (!tipo?.agenda_id) { setBloques([]); return; }
    void api<{ bloques: Bloque[] }>(`/api/agendas/${tipo.agenda_id}/dia/${fecha}`)
      .then((datos) => setBloques(datos.bloques))
      .catch(() => setBloques([]));
  }, [tipo?.agenda_id, fecha]);

  function alternarClase(codigo: string) {
    setClases((actual) => actual.includes(codigo) ? actual.filter((item) => item !== codigo) : [...actual, codigo]);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    try {
      const respuesta = await api<{ cita: { id: string }; alertaInasistencias: boolean }>("/api/citas", {
        method: "POST",
        body: {
          tipoTramiteId: tipoId,
          fecha,
          hora,
          clases,
          licenciaObtenidaEl: licencia || undefined,
          nacionalidad: tipoId === "CANJE_EXTRANJERA" ? nacionalidad : undefined,
          declaraDomicilioRecoleta: domicilio,
          ciudadano: { rut, nombres, apellidos, email: sinCorreo ? undefined : email, sinCorreo, telefono: telefono || undefined, fechaNacimiento: nacimiento || undefined },
        },
      });
      setCreada(respuesta.cita.id);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo reservar.");
    }
  }

  const volver = params.get("agenda") === "primera_vez" ? "/agenda/primera_vez" : params.get("agenda") === "general" ? "/agenda/general" : "/";

  if (creada) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-[#141b2b]/55 px-4">
        <section className="superficie grid w-full max-w-md gap-4 p-6">
          <h1 className="text-2xl font-semibold">Cita agendada</h1>
          <Link className="btn bg-pine text-white hover:bg-pine-dark" to={`/citas/${creada}`}>Abrir</Link>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#141b2b]/55 px-3 py-6 sm:px-4 sm:py-10">
    <form onSubmit={enviar} className="superficie mx-auto grid w-full max-w-xl gap-5 p-5 sm:p-7" noValidate>
      <div className="flex items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Nueva cita</h1>
        <Link className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-paper hover:text-ink" to={volver}>Cerrar</Link>
      </div>
      <ol className="grid grid-cols-3 gap-2">
        {[["1", "Trámite"], ["2", "Horario"], ["3", "Persona"]].map(([numero, texto]) => (
          <li key={numero} className="rounded-lg bg-paper px-2.5 py-2">
            <span className="mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-pine text-[11px] font-semibold text-white">{numero}</span>
            <span className="block text-sm font-medium">{texto}</span>
          </li>
        ))}
      </ol>
      <p className="sr-only">1 · Trámite</p>
      {error ? <Aviso>{error}</Aviso> : null}
      <Campo id="tipo" etiqueta="Tipo de trámite">
        <select id="tipo" className={claseCampo} value={tipoId} onChange={(e) => setTipoId(e.target.value)} required>
          {tipos.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select>
      </Campo>
      {tipo?.id.startsWith("CONTROL_") ? (
        <Fecha id="licencia" etiqueta="Licencia obtenida el" valor={licencia} alCambiar={setLicencia} />
      ) : null}
      {tipoId === "CANJE_EXTRANJERA" ? (
        <Campo id="nacionalidad" etiqueta="Nacionalidad">
          <input id="nacionalidad" className={claseCampo} value={nacionalidad} onChange={(e) => setNacionalidad(e.target.value)} />
        </Campo>
      ) : null}
      <p className="sr-only">2 · Horario</p>
      <Fecha id="dia" etiqueta="Día" valor={fecha} alCambiar={setFecha} />
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Hora</legend>
        <div className="flex flex-wrap gap-2">
          {bloques.filter((bloque) => bloque.usados < bloque.capacidad).map((bloque) => (
            <label key={bloque.hora} className={`h-10 cursor-pointer rounded-full border px-3 text-sm leading-10 ${hora === bloque.hora ? "border-[#1e283c] bg-[#1e283c] text-white" : "border-[#d5deef] bg-[#f4f7fd] text-[#1e283c]"}`}>
              <input className="sr-only" type="radio" name="hora" value={bloque.hora} checked={hora === bloque.hora} onChange={() => setHora(bloque.hora)} required />
              {bloque.hora}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="sr-only">3 · Persona</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Campo id="rut" etiqueta="RUT"><input id="rut" className={claseCampo} value={rut} onChange={(e) => setRut(e.target.value)} required /></Campo>
        <Campo id="nombres" etiqueta="Nombres"><input id="nombres" className={claseCampo} value={nombres} onChange={(e) => setNombres(e.target.value)} required /></Campo>
        <Campo id="apellidos" etiqueta="Apellidos"><input id="apellidos" className={claseCampo} value={apellidos} onChange={(e) => setApellidos(e.target.value)} required /></Campo>
        <Campo id="email" etiqueta="Correo">
          <input id="email" className={claseCampo} type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sinCorreo} required={!sinCorreo} />
        </Campo>
        <label className="flex items-end gap-2 text-sm"><input type="checkbox" checked={sinCorreo} onChange={(e) => setSinCorreo(e.target.checked)} /> No tiene correo</label>
        <Campo id="telefono" etiqueta="Teléfono">
          <input id="telefono" className={claseCampo} value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        </Campo>
        <Fecha id="nacimiento" etiqueta="Fecha de nacimiento" valor={nacimiento} alCambiar={setNacimiento} />
      </div>
      <fieldset className="flex gap-4">
        <legend className="text-sm font-semibold">Clases</legend>
        {["B", "C"].map((codigo) => (
          <label key={codigo} className="flex items-center gap-2"><input type="checkbox" checked={clases.includes(codigo)} onChange={() => alternarClase(codigo)} /> Clase {codigo}</label>
        ))}
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={domicilio} onChange={(e) => setDomicilio(e.target.checked)} />
        Domicilio en Recoleta
      </label>
      <Boton>Reservar hora</Boton>
    </form>
    </div>
  );
}
