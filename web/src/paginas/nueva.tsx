import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, fechaHoy } from "../api";
import { useAuth } from "../auth";
import { normalizarRut } from "../../../src/domain/rut";
import { Fecha } from "../fecha";
import { Aviso, Campo, claseCampo } from "../ui";

interface Tipo {
  id: string;
  nombre: string;
  requiere_agenda: number;
  agenda_id: "GENERAL" | "PRIMERA_VEZ" | null;
  orden: number;
}
interface Bloque {
  hora: string;
  capacidad: number;
  usados: number;
}

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
  const [guardando, setGuardando] = useState(false);
  const enviando = useRef(false);
  const intento = useRef({ cuerpo: "", clave: "" });
  const [buscando, setBuscando] = useState(false);
  const [avisoPersona, setAvisoPersona] = useState("");
  const [activas, setActivas] = useState<
    { id: string; fecha: string; hora: string }[]
  >([]);
  const consultaRut = useRef(0);
  const [cargandoHoras, setCargandoHoras] = useState(false);
  const [errorHoras, setErrorHoras] = useState("");
  const [revisionHoras, setRevisionHoras] = useState(0);

  async function buscarPersona() {
    const normalizado = normalizarRut(rut);
    if (!normalizado) {
      setAvisoPersona("Revise el RUT y su dígito verificador.");
      return;
    }
    const numero = ++consultaRut.current;
    setBuscando(true);
    setAvisoPersona("");
    setActivas([]);
    try {
      const datos = await api<{
        ciudadano: {
          nombres: string;
          apellidos: string;
          email: string | null;
          sin_correo: number;
          telefono: string | null;
          fecha_nacimiento: string | null;
        } | null;
        citasActivas: { id: string; fecha: string; hora: string }[];
        alertaInasistencias: boolean;
      }>(`/api/ciudadanos?rut=${encodeURIComponent(normalizado)}`);
      if (numero !== consultaRut.current) return;
      setRut(normalizado);
      setActivas(datos.citasActivas);
      if (datos.ciudadano) {
        const c = datos.ciudadano;
        setNombres(c.nombres);
        setApellidos(c.apellidos);
        setEmail(c.email ?? "");
        setSinCorreo(c.sin_correo === 1);
        setTelefono(c.telefono ?? "");
        setNacimiento(c.fecha_nacimiento ?? "");
        setAvisoPersona(
          `Datos recuperados. Revise que estén vigentes.${datos.alertaInasistencias ? " Registra dos o más inasistencias." : ""}`,
        );
      } else
        setAvisoPersona(
          "No hay registros para este RUT. Complete los datos de la persona.",
        );
    } catch (falla) {
      if (numero === consultaRut.current)
        setAvisoPersona(
          falla instanceof Error
            ? falla.message
            : "No se pudo consultar el RUT.",
        );
    } finally {
      if (numero === consultaRut.current) setBuscando(false);
    }
  }

  const tipo = tipos.find((item) => item.id === tipoId);
  useEffect(() => {
    document.title = "Nueva cita · Agendamiento Licencias";
    void api<{ tipos: Tipo[] }>("/api/tipos-tramite")
      .then((datos) => {
        const propios = usuario?.rol === "INSTRUCTOR" ? [] : datos.tipos;
        const pedida = params.get("agenda");
        const preferido = propios.find((item) =>
          pedida === "primera_vez"
            ? item.agenda_id === "PRIMERA_VEZ"
            : pedida === "general"
              ? item.id === "CONTROL_RENOVACION"
              : item.requiere_agenda === 1,
        );
        setTipos(propios);
        setTipoId(preferido?.id ?? propios[0]?.id ?? "");
      })
      .catch((falla: unknown) =>
        setError(
          falla instanceof Error
            ? falla.message
            : "No se pudo leer el catálogo.",
        ),
      );
  }, [params, usuario?.rol]);

  useEffect(() => {
    const controlador = new AbortController();
    setBloques([]);
    setErrorHoras("");
    if (!tipo?.agenda_id) {
      setCargandoHoras(false);
      return;
    }
    setCargandoHoras(true);
    void api<{ bloques: Bloque[] }>(
      `/api/agendas/${tipo.agenda_id}/dia/${fecha}`,
      { signal: controlador.signal },
    )
      .then((datos) => {
        setBloques(datos.bloques);
        setHora((actual) =>
          datos.bloques.some((b) => b.hora === actual && b.usados < b.capacidad)
            ? actual
            : "",
        );
      })
      .catch((falla: unknown) => {
        if (!controlador.signal.aborted)
          setErrorHoras(
            falla instanceof Error
              ? falla.message
              : "No se pudieron cargar los horarios.",
          );
      })
      .finally(() => {
        if (!controlador.signal.aborted) setCargandoHoras(false);
      });
    return () => controlador.abort();
  }, [tipo?.agenda_id, fecha, revisionHoras]);

  function alternarClase(codigo: string) {
    setClases((actual) =>
      actual.includes(codigo)
        ? actual.filter((item) => item !== codigo)
        : [...actual, codigo],
    );
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (enviando.current) return;
    setError("");
    if (!normalizarRut(rut)) {
      setError("Revise el RUT y su dígito verificador.");
      return;
    }
    if (
      !hora ||
      !bloques.some((b) => b.hora === hora && b.usados < b.capacidad)
    ) {
      setError("Seleccione un horario disponible.");
      return;
    }
    enviando.current = true;
    setGuardando(true);
    try {
      const cuerpo = {
        tipoTramiteId: tipoId,
        fecha,
        hora,
        clases,
        licenciaObtenidaEl: licencia || undefined,
        nacionalidad: tipoId === "CANJE_EXTRANJERA" ? nacionalidad : undefined,
        declaraDomicilioRecoleta: domicilio,
        ciudadano: {
          rut,
          nombres,
          apellidos,
          email: sinCorreo ? undefined : email,
          sinCorreo,
          telefono: telefono || undefined,
          fechaNacimiento: nacimiento || undefined,
        },
      };
      const serializado = JSON.stringify(cuerpo);
      if (intento.current.cuerpo !== serializado)
        intento.current = { cuerpo: serializado, clave: crypto.randomUUID() };
      const respuesta = await api<{
        cita: { id: string };
        alertaInasistencias: boolean;
      }>("/api/citas", {
        method: "POST",
        body: cuerpo,
        idempotencyKey: intento.current.clave,
      });
      setCreada(respuesta.cita.id);
      if (respuesta.alertaInasistencias)
        setAvisoPersona("La persona registra dos o más inasistencias.");
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo reservar.");
      enviando.current = false;
    } finally {
      setGuardando(false);
    }
  }

  const destino = params.get("volver");
  const volver =
    destino && /^\/agenda\/(general|primera_vez)(\?|$)/.test(destino)
      ? destino
      : params.get("agenda") === "primera_vez"
        ? "/agenda/primera_vez"
        : params.get("agenda") === "general"
          ? "/agenda/general"
          : "/";

  if (creada) {
    return (
      <div className="fixed inset-0 z-40 grid place-items-center bg-[#141b2b]/55 px-4">
        <section className="superficie grid w-full max-w-md gap-4 p-6">
          <h1 className="text-2xl font-semibold">Cita agendada</h1>
          <p className="text-sm text-muted">
            {nombres} {apellidos} · {fecha} · {hora}
          </p>
          {avisoPersona.includes("inasistencias") ? (
            <Aviso tono="info">{avisoPersona}</Aviso>
          ) : null}
          <Link className="btn border border-line bg-white" to={volver}>
            Volver a la agenda
          </Link>
          <Link
            className="btn bg-pine text-white hover:bg-pine-dark"
            to={`/citas/${creada}`}
          >
            Abrir
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-[#141b2b]/55 px-3 py-6 sm:px-4 sm:py-10">
      <form
        onSubmit={enviar}
        className="superficie booking-form mx-auto grid w-full max-w-2xl gap-5 p-5 sm:p-8"
      >
        <div className="flex items-start justify-between gap-3">
          <h1 className="page-title">Nueva cita</h1>
          <Link
            className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-paper hover:text-ink"
            to={volver}
          >
            Cerrar
          </Link>
        </div>
        <p className="text-sm text-muted">
          Busque a la persona y confirme el trámite y el horario.
        </p>
        <fieldset
          className="grid gap-3 rounded-xl border border-line bg-paper p-4"
          disabled={guardando}
        >
          <legend className="px-1 text-sm font-semibold">
            01 · Identificar persona
          </legend>
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-0 flex-1">
              <Campo id="rut" etiqueta="RUT">
                <input
                  id="rut"
                  className={claseCampo}
                  value={rut}
                  onChange={(e) => {
                    consultaRut.current++;
                    setBuscando(false);
                    setRut(e.target.value);
                    setAvisoPersona("");
                    setActivas([]);
                    setNombres("");
                    setApellidos("");
                    setEmail("");
                    setSinCorreo(false);
                    setTelefono("");
                    setNacimiento("");
                  }}
                  required
                />
              </Campo>
            </div>
            <button
              type="button"
              disabled={buscando}
              className="btn border border-line bg-white"
              onClick={() => void buscarPersona()}
            >
              {buscando ? "Buscando…" : "Buscar RUT"}
            </button>
          </div>
          {avisoPersona ? (
            <p role="status" className="text-sm">
              {avisoPersona}
            </p>
          ) : null}
          {activas.map((cita) => (
            <Link
              key={cita.id}
              className="text-sm text-sky underline"
              to={`/citas/${cita.id}`}
            >
              Cita activa: {cita.fecha} a las {cita.hora}. Abrir ficha
            </Link>
          ))}
        </fieldset>
        {error ? <Aviso>{error}</Aviso> : null}
        <h2 className="form-section-title">
          <span aria-hidden>02</span> Trámite y horario
        </h2>
        <Campo id="tipo" etiqueta="Tipo de trámite">
          <select
            id="tipo"
            className={claseCampo}
            value={tipoId}
            onChange={(e) => setTipoId(e.target.value)}
            required
          >
            {tipos.map((item) => (
              <option key={item.id} value={item.id}>
                {item.nombre}
              </option>
            ))}
          </select>
        </Campo>
        {tipo?.id.startsWith("CONTROL_") ? (
          <Fecha
            id="licencia"
            etiqueta="Licencia obtenida el"
            valor={licencia}
            alCambiar={setLicencia}
          />
        ) : null}
        {tipoId === "CANJE_EXTRANJERA" ? (
          <Campo id="nacionalidad" etiqueta="Nacionalidad">
            <input
              id="nacionalidad"
              className={claseCampo}
              value={nacionalidad}
              onChange={(e) => setNacionalidad(e.target.value)}
            />
          </Campo>
        ) : null}
        {errorHoras ? (
          <Aviso>
            {errorHoras}{" "}
            <button
              type="button"
              className="underline"
              onClick={() => setRevisionHoras((n) => n + 1)}
            >
              Reintentar horarios
            </button>
          </Aviso>
        ) : null}
        {cargandoHoras ? (
          <p role="status" className="text-sm text-muted">
            Cargando horarios…
          </p>
        ) : null}
        {!cargandoHoras &&
        !errorHoras &&
        tipo?.agenda_id &&
        !bloques.some((b) => b.usados < b.capacidad) ? (
          <Aviso tono="info">No hay cupos disponibles para este día.</Aviso>
        ) : null}
        {tipo && !tipo.requiere_agenda ? (
          <Aviso tono="info">
            Este trámite no requiere reserva en esta agenda.
          </Aviso>
        ) : null}
        <Fecha id="dia" etiqueta="Día" valor={fecha} alCambiar={setFecha} />
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Hora</legend>
          <div className="flex flex-wrap gap-2">
            {bloques
              .filter((bloque) => bloque.usados < bloque.capacidad)
              .map((bloque) => (
                <label
                  key={bloque.hora}
                  className={`h-10 cursor-pointer rounded-full border px-3 text-sm leading-10 ${hora === bloque.hora ? "border-[#1e283c] bg-[#1e283c] text-white" : "border-[#d5deef] bg-[#f4f7fd] text-[#1e283c]"}`}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name="hora"
                    value={bloque.hora}
                    checked={hora === bloque.hora}
                    onChange={() => setHora(bloque.hora)}
                    required
                  />
                  {bloque.hora}
                </label>
              ))}
          </div>
        </fieldset>
        <h2 className="form-section-title">
          <span aria-hidden>03</span> Datos de contacto
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="nombres" etiqueta="Nombres">
            <input
              id="nombres"
              className={claseCampo}
              value={nombres}
              onChange={(e) => setNombres(e.target.value)}
              required
            />
          </Campo>
          <Campo id="apellidos" etiqueta="Apellidos">
            <input
              id="apellidos"
              className={claseCampo}
              value={apellidos}
              onChange={(e) => setApellidos(e.target.value)}
              required
            />
          </Campo>
          <Campo id="email" etiqueta="Correo">
            <input
              id="email"
              className={claseCampo}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={sinCorreo}
              required={!sinCorreo}
            />
          </Campo>
          <label className="flex items-end gap-2 text-sm">
            <input
              type="checkbox"
              checked={sinCorreo}
              onChange={(e) => setSinCorreo(e.target.checked)}
            />{" "}
            No tiene correo
          </label>
          <Campo id="telefono" etiqueta="Teléfono">
            <input
              id="telefono"
              className={claseCampo}
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
            />
          </Campo>
          <Fecha
            id="nacimiento"
            etiqueta="Fecha de nacimiento"
            valor={nacimiento}
            alCambiar={setNacimiento}
          />
        </div>
        <fieldset className="flex gap-4">
          <legend className="text-sm font-semibold">Clases</legend>
          {["B", "C"].map((codigo) => (
            <label key={codigo} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={clases.includes(codigo)}
                onChange={() => alternarClase(codigo)}
              />{" "}
              Clase {codigo}
            </label>
          ))}
        </fieldset>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={domicilio}
            onChange={(e) => setDomicilio(e.target.checked)}
          />
          Domicilio en Recoleta
        </label>
        <button
          type="submit"
          disabled={
            guardando ||
            buscando ||
            cargandoHoras ||
            Boolean(errorHoras) ||
            !tipo?.requiere_agenda ||
            !hora
          }
          className="btn bg-sky text-white"
          aria-busy={guardando}
        >
          {guardando ? "Guardando reserva…" : "Confirmar reserva"}
        </button>
      </form>
    </div>
  );
}
