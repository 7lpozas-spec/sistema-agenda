import { evaluarHabilitacionExamen, type CitaExamen, type EvaluacionExamen } from "../domain/examen";

interface FilaCita {
  id: string;
  ciudadano_id: string;
  agenda_id: string;
  tipo_tramite_id: string;
  fecha: string;
  hora: string;
  estado: string;
  resultado: string | null;
  atencion_at: string | null;
  clases: string;
  rut: string;
  nombres: string;
  apellidos: string;
  email: string | null;
  telefono: string | null;
  fecha_nacimiento: string | null;
}

const COLUMNAS = `c.id, c.ciudadano_id, c.agenda_id, c.tipo_tramite_id, c.fecha, c.hora, c.estado, c.resultado, c.atencion_at, c.clases,
        ci.rut, ci.nombres, ci.apellidos, ci.email, ci.telefono, ci.fecha_nacimiento`;

async function citasDeExamen(db: D1Database, ciudadanoId?: string): Promise<FilaCita[]> {
  const filtro = ciudadanoId
    ? " AND c.ciudadano_id = ?"
    : "";
  const consulta = db.prepare(
    `SELECT ${COLUMNAS}
     FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id
     WHERE (
       (c.agenda_id = 'GENERAL' AND c.tipo_tramite_id LIKE 'PRIMER_OTORG_%')
       OR c.agenda_id = 'PRIMERA_VEZ'
     )${filtro}
     ORDER BY c.fecha, c.hora, c.creado_at`,
  );
  const filas = ciudadanoId ? await consulta.bind(ciudadanoId).all<FilaCita>() : await consulta.all<FilaCita>();
  return filas.results;
}

function partir(filas: FilaCita[]) {
  return {
    otorgamientos: filas.filter((fila) => fila.agenda_id === "GENERAL"),
    examenes: filas.filter((fila) => fila.agenda_id === "PRIMERA_VEZ"),
  };
}

export interface EstadoExamen extends EvaluacionExamen {
  intentos: CitaExamen[];
  clases: string[];
  ciudadano?: {
    id: string;
    rut: string;
    nombres: string;
    apellidos: string;
    email: string | null;
    telefono: string | null;
    fecha_nacimiento: string | null;
  };
}

function clasesDe(valor: string | null | undefined): string[] {
  if (!valor) return ["B"];
  try {
    const lista = JSON.parse(valor) as unknown;
    if (Array.isArray(lista) && lista.length > 0) return lista.filter((item): item is string => typeof item === "string");
  } catch { /* texto plano */ }
  return ["B"];
}

function armarEstado(filas: FilaCita[]): EstadoExamen {
  const { otorgamientos, examenes } = partir(filas);
  const evaluacion = evaluarHabilitacionExamen({ otorgamientos, examenes });
  const ultima = [...otorgamientos].reverse()[0];
  const persona = filas[0];
  return {
    ...evaluacion,
    intentos: examenes.map((fila) => ({
      id: fila.id, fecha: fila.fecha, hora: fila.hora, estado: fila.estado, resultado: fila.resultado,
    })),
    clases: clasesDe(ultima?.clases),
    ciudadano: persona
      ? {
        id: persona.ciudadano_id,
        rut: persona.rut,
        nombres: persona.nombres,
        apellidos: persona.apellidos,
        email: persona.email,
        telefono: persona.telefono,
        fecha_nacimiento: persona.fecha_nacimiento,
      }
      : undefined,
  };
}

export async function estadoExamenPractico(db: D1Database, ciudadanoId: string): Promise<EstadoExamen> {
  return armarEstado(await citasDeExamen(db, ciudadanoId));
}

export interface PendienteExamen {
  ciudadanoId: string;
  rut: string;
  nombres: string;
  apellidos: string;
  nombre: string;
  clases: string[];
  otorgamientoId: string;
  otorgamientoFecha: string;
  ultimoIntento: CitaExamen | null;
}

export async function listarPendientesExamen(db: D1Database): Promise<PendienteExamen[]> {
  const filas = await citasDeExamen(db);
  const porPersona = new Map<string, FilaCita[]>();
  for (const fila of filas) {
    const lista = porPersona.get(fila.ciudadano_id) ?? [];
    lista.push(fila);
    porPersona.set(fila.ciudadano_id, lista);
  }
  const pendientes: PendienteExamen[] = [];
  for (const [ciudadanoId, grupo] of porPersona) {
    const estado = armarEstado(grupo);
    if (!estado.habilitado || !estado.ciudadano) continue;
    const otorgamientos = grupo.filter((fila) => fila.agenda_id === "GENERAL" && fila.atencion_at);
    const ultimoOtorgamiento = otorgamientos.at(-1);
    if (!ultimoOtorgamiento) continue;
    pendientes.push({
      ciudadanoId,
      rut: estado.ciudadano.rut,
      nombres: estado.ciudadano.nombres,
      apellidos: estado.ciudadano.apellidos,
      nombre: `${estado.ciudadano.apellidos}, ${estado.ciudadano.nombres}`,
      clases: estado.clases,
      otorgamientoId: ultimoOtorgamiento.id,
      otorgamientoFecha: ultimoOtorgamiento.fecha,
      ultimoIntento: estado.intentos.at(-1) ?? null,
    });
  }
  pendientes.sort((a, b) => {
    const fa = a.ultimoIntento?.fecha ?? a.otorgamientoFecha;
    const fb = b.ultimoIntento?.fecha ?? b.otorgamientoFecha;
    return fa < fb ? -1 : fa > fb ? 1 : 0;
  });
  return pendientes;
}
