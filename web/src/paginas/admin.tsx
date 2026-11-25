import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Fecha } from "../fecha";
import { Aviso, Boton, Campo, Cargando, Vacio, claseCampo } from "../ui";

interface Parametro {
  clave: string;
  valor: string;
  tipo: string;
  descripcion: string;
}
interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: string;
  activo: boolean;
}
interface Feriado {
  fecha: string;
  nombre: string;
  activo: number;
}
function visible(fila: Parametro): boolean {
  const texto = `${fila.clave} ${fila.descripcion} ${ETIQUETA[fila.clave] ?? ""}`;
  if (!ETIQUETA[fila.clave]) return false;
  return !/TODO|DECISI[ÓO]N PENDIENTE|atencion_sin_hora/i.test(texto);
}

const ETIQUETA: Record<string, string> = {
  auth_modo: "Autenticación",
  zona_horaria: "Zona horaria",
  gracia_cierre_minutos: "Gracia del cierre",
  hora_recordatorio: "Hora de recordatorio",
  minutos_deshacer_asistencia: "Minutos para deshacer",
  alerta_inasistencias: "Alerta de inasistencias",
  meses_inasistencia: "Meses de inasistencia",
  retencion_fotos_meses: "Retención de fotos",
  direccion_atencion: "Dirección",
  telefono_consultas: "Teléfono",
  correo_remitente: "Correo remitente",
  logo_alt: "Texto del logo",
  examenes_por_hora: "Exámenes por hora",
  backup_retencion_dias: "Retención de respaldo",
};

interface Evento {
  id: string;
  accion: string;
  entidad: string;
  at: string;
  usuario: string | null;
}
interface Horario {
  id: string;
  agenda_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export function Admin() {
  const { usuario } = useAuth();
  const [seccion, setSeccion] = useState("parametros");
  if (usuario && usuario.rol !== "ADMIN") return <Aviso tono="info">Solo administración entra a esta sección.</Aviso>;
  return (
    <section className="grid gap-4">
      <h1 className="text-3xl font-semibold">Administración</h1>
      <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm" role="tablist" aria-label="Herramientas">
        {[
          ["parametros", "Parámetros"],
          ["horario", "Horario"],
          ["importar", "Importar"],
          ["usuarios", "Cuentas"],
          ["feriados", "Feriados"],
          ["cupos", "Cupos"],
          ["auditoria", "Auditoría"],
        ].map(([id, texto]) => (
          <button key={id} type="button" role="tab" aria-selected={seccion === id} className={`rounded-full px-3 py-1.5 text-sm transition-colors ${seccion === id ? "bg-[#1e283c] text-white" : "text-muted hover:text-ink"}`} onClick={() => setSeccion(id)}>
            {texto}
          </button>
        ))}
      </div>
      <div className="superficie p-4 sm:p-6">
      {seccion === "parametros" ? <Parametros /> : null}
      {seccion === "horario" ? <HorarioOficina /> : null}
      {seccion === "importar" ? <Importar /> : null}
      {seccion === "usuarios" ? <Cuentas /> : null}
      {seccion === "feriados" ? <Feriados /> : null}
      {seccion === "cupos" ? <Cupos /> : null}
      {seccion === "auditoria" ? <Auditoria /> : null}
      </div>
    </section>
  );
}

function Parametros() {
  const [filas, setFilas] = useState<Parametro[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    document.title = "Parámetros · Licencias Recoleta";
    void api<{ parametros: Parametro[] }>("/api/parametros").then((datos) => setFilas(datos.parametros)).catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "Error"));
  }, []);
  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!filas) return;
    setError("");
    const datos = new FormData(evento.currentTarget);
    const cambios = filas.filter((fila) => visible(fila)).map((fila) => ({ clave: fila.clave, valor: String(datos.get(fila.clave) ?? "") }));
    try {
      const respuesta = await api<{ parametros: Parametro[] }>("/api/parametros", { method: "PATCH", body: { cambios } });
      setFilas(respuesta.parametros);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo guardar.");
    }
  }
  if (!filas && !error) return <Cargando texto="Cargando parámetros…" />;
  return (
    <form onSubmit={guardar} className="grid gap-4">
      {error ? <Aviso>{error}</Aviso> : null}
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
        {filas?.filter(visible).map((fila) => (
          <div key={fila.clave} className="grid gap-2 px-4 py-3 sm:grid-cols-[14rem_minmax(0,28rem)] sm:items-center sm:gap-6">
            <label htmlFor={fila.clave} className="text-sm font-medium">
              <span className="sr-only">{fila.clave}. </span>
              {ETIQUETA[fila.clave] ?? fila.clave}
            </label>
            <input id={fila.clave} name={fila.clave} className={claseCampo} defaultValue={fila.valor} />
          </div>
        ))}
      </div>
      <div className="flex justify-end pt-2">
        <Boton>Guardar</Boton>
      </div>
    </form>
  );
}

function Cuentas() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [error, setError] = useState("");
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState("OPERADOR_AGENDA");
  const [contrasena, setContrasena] = useState("");
  useEffect(() => {
    void api<{ usuarios: Usuario[] }>("/api/usuarios").then((datos) => setUsuarios(datos.usuarios));
  }, []);
  async function crear(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    try {
      await api("/api/usuarios", { method: "POST", body: { nombre, email, rol, contrasena } });
      const datos = await api<{ usuarios: Usuario[] }>("/api/usuarios");
      setUsuarios(datos.usuarios);
      setNombre("");
      setEmail("");
      setContrasena("");
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo crear la cuenta.");
    }
  }
  return (
    <div className="grid gap-4">
      {error ? <Aviso>{error}</Aviso> : null}
      <ul className="grid gap-2">
        {usuarios.map((cuenta) => (
          <li key={cuenta.id} className="flex flex-wrap items-center justify-between gap-2 border border-line bg-card px-3 py-2 text-sm">
            <span>{cuenta.nombre} · {cuenta.email}</span>
            <span className="flex flex-wrap items-center gap-2">
              <span>{cuenta.rol} · {cuenta.activo ? "activa" : "inactiva"}</span>
              <button type="button" className="underline" onClick={() => void api(`/api/usuarios/${cuenta.id}`, { method: "PATCH", body: { activo: !cuenta.activo } }).then(() => api<{ usuarios: Usuario[] }>("/api/usuarios").then((datos) => setUsuarios(datos.usuarios)))}>{cuenta.activo ? "Desactivar" : "Activar"}</button>
            </span>
          </li>
        ))}
      </ul>
      <form onSubmit={crear} className="grid gap-3 border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Nueva cuenta</h2>
        <Campo id="nombre-cuenta" etiqueta="Nombre"><input id="nombre-cuenta" className={claseCampo} value={nombre} onChange={(e) => setNombre(e.target.value)} required /></Campo>
        <Campo id="correo-cuenta" etiqueta="Correo"><input id="correo-cuenta" className={claseCampo} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Campo>
        <Campo id="rol-cuenta" etiqueta="Rol">
          <select id="rol-cuenta" className={claseCampo} value={rol} onChange={(e) => setRol(e.target.value)}>
            <option value="ADMIN">Administración</option>
            <option value="OPERADOR_AGENDA">Operador de agenda</option>
            <option value="INSTRUCTOR">Instructor</option>
            <option value="RECEPCION">Recepción</option>
          </select>
        </Campo>
        <Campo id="clave-cuenta" etiqueta="Contraseña temporal" ayuda="Mínimo 12 caracteres, con mayúscula, minúscula y número.">
          <input id="clave-cuenta" className={claseCampo} type="text" value={contrasena} onChange={(e) => setContrasena(e.target.value)} required />
        </Campo>
        <Boton>Crear cuenta</Boton>
      </form>
      <ClaveCuenta usuarios={usuarios} />
    </div>
  );
}

function ClaveCuenta({ usuarios }: { usuarios: Usuario[] }) {
  const [id, setId] = useState(usuarios[0]?.id ?? "");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    try {
      await api(`/api/usuarios/${id}`, { method: "PATCH", body: { contrasena: clave } });
      setClave("");
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo cambiar la clave.");
    }
  }
  return (
    <form onSubmit={guardar} className="grid gap-3 border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">Nueva clave</h2>
      {error ? <Aviso>{error}</Aviso> : null}
      <Campo id="cuenta-clave" etiqueta="Cuenta">
        <select id="cuenta-clave" className={claseCampo} value={id} onChange={(e) => setId(e.target.value)}>
          {usuarios.map((cuenta) => <option key={cuenta.id} value={cuenta.id}>{cuenta.nombre}</option>)}
        </select>
      </Campo>
      <Campo id="nueva-clave" etiqueta="Clave" ayuda="Mínimo 12 caracteres, con mayúscula, minúscula y número.">
        <input id="nueva-clave" className={claseCampo} type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
      </Campo>
      <Boton>Guardar clave</Boton>
    </form>
  );
}

function Feriados() {
  const [filas, setFilas] = useState<Feriado[] | null>(null);
  const [fecha, setFecha] = useState("");
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  function cargar() {
    void api<{ feriados: Feriado[] }>("/api/feriados")
      .then((datos) => setFilas(datos.feriados))
      .catch((falla: unknown) => {
        setFilas([]);
        setError(falla instanceof Error ? falla.message : "No se pudieron leer los feriados.");
      });
  }
  useEffect(cargar, []);
  async function agregar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    try {
      await api("/api/feriados", { method: "POST", body: { fecha, nombre } });
      setFecha("");
      setNombre("");
      cargar();
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo guardar el feriado.");
    }
  }
  return (
    <div className="grid gap-4">
      {error ? <Aviso>{error}</Aviso> : null}
      {!filas ? <Cargando texto="Cargando feriados…" /> : null}
      <ul className="grid max-h-80 gap-1 overflow-auto text-sm">
        {filas?.filter((fila) => fila.activo === 1).map((fila) => <li key={fila.fecha}>{fila.fecha} · {fila.nombre}</li>)}
      </ul>
      <Cierre />
      <form onSubmit={agregar} className="grid gap-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <Fecha id="fecha-feriado" etiqueta="Fecha" valor={fecha} alCambiar={setFecha} />
        <Campo id="nombre-feriado" etiqueta="Nombre"><input id="nombre-feriado" className={claseCampo} value={nombre} onChange={(e) => setNombre(e.target.value)} required /></Campo>
        <Boton>Agregar</Boton>
      </form>
    </div>
  );
}

interface Propuesta { citaId: string; nombre: string; horaActual: string; fecha: string; hora: string }
interface Afectada { id: string; hora: string; nombre: string }

function Cierre() {
  const [agenda, setAgenda] = useState("GENERAL");
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [motivo, setMotivo] = useState("");
  const [propuestas, setPropuestas] = useState<Propuesta[]>([]);
  const [sinCupo, setSinCupo] = useState<Afectada[]>([]);
  const [revisado, setRevisado] = useState<"dia" | "bloque" | "">("");
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  function aplicar(modo: "dia" | "bloque", citas: Afectada[], lista: Propuesta[]) {
    const asignadas = new Set(lista.map((fila) => fila.citaId));
    setPropuestas(lista);
    setSinCupo(citas.filter((fila) => !asignadas.has(fila.id)));
    setRevisado(modo);
  }
  function descartar() {
    setPropuestas([]);
    setSinCupo([]);
    setRevisado("");
    setAviso("");
  }
  async function revisarDia(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    setAviso("");
    try {
      const respuesta = await api<{ citas: Afectada[]; propuestas: Propuesta[] }>("/api/config/bloquear-dia", { method: "POST", body: { agendaId: agenda, fecha } });
      aplicar("dia", respuesta.citas, respuesta.propuestas);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo revisar el día.");
    }
  }
  async function revisarBloque() {
    setError("");
    setAviso("");
    if (!/^\d{2}:\d{2}$/.test(hora)) {
      setError("Indique la hora del bloque.");
      return;
    }
    try {
      const respuesta = await api<{ citas: Afectada[]; propuestas: Propuesta[] }>("/api/bloques/bloquear", { method: "POST", body: { agendaId: agenda, fecha, hora } });
      aplicar("bloque", respuesta.citas, respuesta.propuestas);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo revisar el bloque.");
    }
  }
  async function confirmar() {
    setError("");
    setAviso("");
    if (revisado === "dia" && motivo.trim().length < 3) {
      setError("Indique el motivo del día.");
      return;
    }
    try {
      const respuesta = await api<{ reubicadas: number }>("/api/config/cierre/confirmar", {
        method: "POST",
        body: {
          agendaId: agenda,
          fecha,
          hora: revisado === "bloque" ? hora : undefined,
          motivo,
          movimientos: propuestas.map((fila) => ({ citaId: fila.citaId, fecha: fila.fecha, hora: fila.hora })),
        },
      });
      setPropuestas([]);
      setSinCupo([]);
      setRevisado("");
      setAviso(`Cerrado. Reubicadas: ${respuesta.reubicadas}`);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo cerrar.");
    }
  }
  return (
    <form onSubmit={revisarDia} className="grid gap-3 border border-line p-3">
      <h2 className="text-sm font-semibold">Cierre de día o bloque</h2>
      {error ? <Aviso>{error}</Aviso> : null}
      {aviso ? <p className="text-sm font-medium text-[#146c43]">{aviso}</p> : null}
      <select className={claseCampo} value={agenda} onChange={(e) => setAgenda(e.target.value)} aria-label="Agenda del cierre">
        <option value="GENERAL">General</option>
        <option value="PRIMERA_VEZ">Primera vez</option>
      </select>
      <Fecha id="cierre-fecha" etiqueta="Fecha" valor={fecha} alCambiar={setFecha} />
      <Campo id="cierre-hora" etiqueta="Hora del bloque"><input id="cierre-hora" className={claseCampo} inputMode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="09:00" value={hora} onChange={(e) => setHora(e.target.value)} /></Campo>
      <Campo id="cierre-motivo" etiqueta="Motivo del día"><input id="cierre-motivo" className={claseCampo} value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Campo>
      <div className="flex flex-wrap gap-2">
        <Boton>Revisar día</Boton>
        <button type="button" className="btn border border-line bg-white" onClick={() => void revisarBloque()}>Revisar bloque</button>
      </div>
      {revisado ? (
        <div className="grid gap-2">
          <ul className="grid gap-1 text-sm">
            {propuestas.map((fila) => <li key={fila.citaId}>{fila.horaActual} {fila.nombre} → {fila.fecha.slice(8)}-{fila.fecha.slice(5, 7)} {fila.hora}</li>)}
            {sinCupo.map((fila) => <li key={fila.id} className="text-alert">{fila.hora} {fila.nombre} · sin cupo</li>)}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn bg-sky text-white" onClick={() => void confirmar()}>Confirmar cierre</button>
            <button type="button" className="btn border border-line bg-white" onClick={descartar}>Cancelar</button>
          </div>
        </div>
      ) : null}
    </form>
  );
}

function Cupos() {
  const [error, setError] = useState("");
  async function generar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    try {
      let pendiente = true;
      let guardia = 0;
      while (pendiente && guardia < 400) {
        const respuesta = await api<{ creados: number; pendiente: boolean }>("/api/config/cupos/generar", { method: "POST", body: {} });
        pendiente = respuesta.pendiente;
        guardia += 1;
      }
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudieron generar los cupos.");
    }
  }
  return (
    <form onSubmit={generar} className="grid max-w-xl gap-3">
      {error ? <Aviso>{error}</Aviso> : null}
      <Boton>Generar cupos vacíos</Boton>
    </form>
  );
}

function HorarioOficina() {
  const [inicio, setInicio] = useState("08:30");
  const [fin, setFin] = useState("14:00");
  const [inicioSabado, setInicioSabado] = useState("08:30");
  const [finSabado, setFinSabado] = useState("14:00");
  const [filas, setFilas] = useState<Horario[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<{ horarios: Horario[] }>("/api/config/horarios").then((datos) => aplicarHorario(datos.horarios)).catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo leer el horario."));
  }, []);
  function aplicarHorario(horarios: Horario[]) {
    setFilas(horarios);
    const semana = horarios.find((fila) => fila.dia_semana >= 1 && fila.dia_semana <= 5);
    const sabado = horarios.find((fila) => fila.dia_semana === 6);
    if (semana) {
      setInicio(semana.hora_inicio.slice(0, 5));
      setFin(semana.hora_fin.slice(0, 5));
    }
    if (sabado) {
      setInicioSabado(sabado.hora_inicio.slice(0, 5));
      setFinSabado(sabado.hora_fin.slice(0, 5));
    }
  }
  async function guardar(evento: FormEvent) {
    evento.preventDefault();
    setError("");
    try {
      await api("/api/config/horarios", { method: "PATCH", body: { horaInicio: inicio, horaFin: fin, dias: [1, 2, 3, 4, 5] } });
      await api("/api/config/horarios", { method: "PATCH", body: { horaInicio: inicioSabado, horaFin: finSabado, dias: [6] } });
      const datos = await api<{ horarios: Horario[] }>("/api/config/horarios");
      aplicarHorario(datos.horarios);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo guardar el horario.");
    }
  }
  const dias = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
  return (
    <form onSubmit={guardar} className="grid max-w-xl gap-4">
      {error ? <Aviso>{error}</Aviso> : null}
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">Lunes a viernes</legend>
        <Campo id="hora-inicio" etiqueta="Hora de inicio"><input id="hora-inicio" className={claseCampo} inputMode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="08:30" value={inicio} onChange={(e) => setInicio(e.target.value)} required /></Campo>
        <Campo id="hora-fin" etiqueta="Hora de término"><input id="hora-fin" className={claseCampo} inputMode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="14:00" value={fin} onChange={(e) => setFin(e.target.value)} required /></Campo>
      </fieldset>
      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">Sábado</legend>
        <Campo id="hora-inicio-sabado" etiqueta="Hora de inicio"><input id="hora-inicio-sabado" className={claseCampo} inputMode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="08:30" value={inicioSabado} onChange={(e) => setInicioSabado(e.target.value)} required /></Campo>
        <Campo id="hora-fin-sabado" etiqueta="Hora de término"><input id="hora-fin-sabado" className={claseCampo} inputMode="numeric" pattern="[0-2][0-9]:[0-5][0-9]" placeholder="14:00" value={finSabado} onChange={(e) => setFinSabado(e.target.value)} required /></Campo>
      </fieldset>
      <Boton>Guardar horario</Boton>
      <ul className="grid gap-1 text-sm text-muted">
        {filas.map((fila) => <li key={fila.id}>{fila.agenda_id === "PRIMERA_VEZ" ? "Primera vez" : "General"} · {dias[fila.dia_semana]} · {fila.hora_inicio.slice(0, 5)} a {fila.hora_fin.slice(0, 5)}</li>)}
      </ul>
    </form>
  );
}

function Importar() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [resumen, setResumen] = useState("");
  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    if (!archivo) return;
    setError("");
    setResumen("");
    try {
      let csv = await archivo.text();
      if (archivo.name.toLowerCase().endsWith(".xlsx") || archivo.name.toLowerCase().endsWith(".xls")) {
        const XLSX = await import("xlsx");
        const libro = XLSX.read(await archivo.arrayBuffer(), { type: "array" });
        const hoja = libro.Sheets[libro.SheetNames[0]];
        csv = XLSX.utils.sheet_to_csv(hoja, { FS: ";" });
      }
      let siguiente = 0;
      let insertadas = 0;
      let errores = 0;
      let pendiente = true;
      let guardia = 0;
      while (pendiente && guardia < 400) {
        const respuesta = await api<{ insertadas: number; errores: { linea: number }[]; pendiente: boolean; siguiente: number }>(
          `/api/import/citas?desde=${siguiente}`,
          { method: "POST", texto: csv },
        );
        insertadas += respuesta.insertadas;
        errores += respuesta.errores.length;
        pendiente = respuesta.pendiente;
        siguiente = respuesta.siguiente;
        guardia += 1;
      }
      setResumen(`Se insertaron ${insertadas} filas.${errores ? ` ${errores} con error.` : ""}`);
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo importar.");
    }
  }
  return (
    <form onSubmit={enviar} className="grid max-w-xl gap-3">
      {error ? <Aviso>{error}</Aviso> : null}
      {resumen ? <Aviso>{resumen}</Aviso> : null}
      <Campo id="archivo-import" etiqueta="Archivo CSV o Excel">
        <input id="archivo-import" className={claseCampo} type="file" accept=".csv,.xlsx,.xls,text/csv" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
      </Campo>
      <Boton>Importar filas válidas</Boton>
    </form>
  );
}

function Auditoria() {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  useEffect(() => {
    void api<{ eventos: Evento[] }>("/api/auditoria").then((datos) => setEventos(datos.eventos));
  }, []);
  if (!eventos) return <Cargando texto="Leyendo la auditoría…" />;
  if (eventos.length === 0) return <Vacio texto="Todavía no hay movimientos." />;
  return (
    <div className="overflow-x-auto border border-line bg-card">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">Últimos movimientos</caption>
        <thead className="bg-paper">
          <tr>
            <th scope="col" className="px-3 py-2">Cuándo</th>
            <th scope="col" className="px-3 py-2">Quién</th>
            <th scope="col" className="px-3 py-2">Acción</th>
          </tr>
        </thead>
        <tbody>
          {eventos.map((evento) => (
            <tr key={evento.id} className="border-t border-line">
              <td className="px-3 py-2">{evento.at.slice(0, 16).replace("T", " ")}</td>
              <td className="px-3 py-2">{evento.usuario ?? "sistema"}</td>
              <td className="px-3 py-2">{evento.accion} · {evento.entidad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
