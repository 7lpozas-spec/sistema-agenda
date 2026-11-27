import { writeFileSync } from "node:fs";

const OPERADOR = "dc7f1da9-35cc-4353-90d1-6e0f43cbdf6e";
const AHORA = "2026-11-25T12:00:00.000Z";
const FERIADOS = new Set(["2026-11-01", "2026-12-08", "2026-12-25"]);
const NOMBRES = ["Nora", "Mateo", "Isidora", "Benjamín", "Amanda", "Joaquín", "Florencia", "Vicente", "Emilia", "Gaspar"];
const APELLIDOS = ["Soto", "Muñoz", "Contreras", "Sepúlveda", "Vargas", "Reyes", "Fuentes", "Castro", "Navarro", "Pizarro"];

function dv(cuerpo) {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

function sumar(iso, dias) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

function diaIso(iso) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const js = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  return js === 0 ? 7 : js;
}

function horas(inicio, fin, paso) {
  const lista = [];
  let cursor = inicio;
  while (cursor + paso <= fin) {
    const h = String(Math.floor(cursor / 60)).padStart(2, "0");
    const m = String(cursor % 60).padStart(2, "0");
    lista.push(`${h}:${m}`);
    cursor += paso;
  }
  return lista;
}

function q(valor) {
  if (valor === null || valor === undefined) return "NULL";
  return `'${String(valor).replaceAll("'", "''")}'`;
}

function tiempos(id, fecha, hora, estado) {
  if (estado !== "ASISTIO" && estado !== "ATRASADO") return [null, null, null];
  const espera = 12 + (id.charCodeAt(11) % 24);
  const [hh, mm] = hora.split(":").map(Number);
  const total = hh * 60 + mm + espera;
  const salida = `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  return [OPERADOR, `${fecha}T${hora}:00`, `${fecha}T${salida}:00`];
}

function bloques(valores, columnas, tabla) {
  const lineas = [`-- ${tabla}`];
  for (let i = 0; i < valores.length; i += 40) {
    const grupo = valores.slice(i, i + 40).map((fila) => `  (${fila.map(q).join(", ")})`).join(",\n");
    lineas.push(`INSERT INTO ${tabla} (${columnas}) VALUES\n${grupo};`);
  }
  return lineas;
}

const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const horasGeneral = horas(8 * 60 + 30, 14 * 60, 15);
const horasPrimera = horas(8 * 60 + 30, 14 * 60, 30);
const manana = horasGeneral.filter((hora) => hora < "11:30");
const tarde = ["11:30", "11:45", "12:00", "12:30", "13:00", "13:30"];

const ciudadanos = [];
for (let i = 0; i < 240; i += 1) {
  const cuerpo = String(30_000_000 + i);
  ciudadanos.push({
    id: `ciu-${String(i + 1).padStart(4, "0")}`,
    rut: `${cuerpo}-${dv(cuerpo)}`,
    nombres: NOMBRES[i % NOMBRES.length],
    apellidos: `${APELLIDOS[i % APELLIDOS.length]} ${APELLIDOS[(i + 3) % APELLIDOS.length]}`,
    telefono: i % 2 === 0 ? `+56 9 ${String(4000 + (i % 5000)).padStart(4, "0")} ${String(1000 + ((i * 7) % 9000)).padStart(4, "0")}` : "",
  });
}

const usados = new Map();
function sumarUso(agenda, fecha, hora) {
  const dia = `${agenda}|${fecha}`;
  const bloque = `${agenda}|${fecha}|${hora}`;
  usados.set(dia, (usados.get(dia) ?? 0) + 1);
  usados.set(bloque, (usados.get(bloque) ?? 0) + 1);
}

const citas = [];
const ocupado = new Set();
let cursor = 0;
function elegir(agenda, estado) {
  for (let n = 0; n < ciudadanos.length; n += 1) {
    const persona = ciudadanos[(cursor + n) % ciudadanos.length];
    const clave = estado === "AGENDADA" ? `${agenda}:${persona.id}` : "";
    if (clave && ocupado.has(clave)) continue;
    if (clave) ocupado.add(clave);
    cursor = (cursor + n + 1) % ciudadanos.length;
    return persona;
  }
  return null;
}
function estadoPasado(semilla) {
  const resto = Math.abs(semilla) % 10;
  if (resto === 9) return "CANCELADA";
  if (resto <= 1) return "NO_ASISTIO";
  if (resto === 2) return "ATRASADO";
  return "ASISTIO";
}

for (let offset = -48; offset <= 12; offset += 1) {
  const fecha = sumar(hoy, offset);
  const dia = diaIso(fecha);
  if (dia === 7 || FERIADOS.has(fecha)) continue;
  const turno = [...manana.slice(0, dia === 6 ? 6 : 10), ...tarde.slice(0, dia === 6 ? 2 : 4 + (Math.abs(offset) % 3))];
  const dobles = manana.slice(0, dia === 6 ? 0 : 2 + (dia % 3));
  let n = 0;
  for (const hora of [...turno, ...dobles]) {
    const estado = fecha < hoy ? estadoPasado(offset + n) : "AGENDADA";
    const persona = elegir("GENERAL", estado);
    if (!persona) continue;
    citas.push([`cit-g-${fecha}-${hora}-${n}`, "GENERAL", persona.id, n % 5 === 0 ? "CONTROL_RENOVACION_L19495" : "CONTROL_RENOVACION", '["B"]', fecha, hora, estado, 0, "PRESENCIAL", 1, 2, OPERADOR, AHORA, ...tiempos(`cit-g-${fecha}-${hora}-${n}`, fecha, hora, estado)]);
    if (estado !== "CANCELADA") sumarUso("GENERAL", fecha, hora);
    n += 1;
  }
  const examenes = ["08:30", "09:30", "10:30", "11:30"].slice(0, dia === 6 ? 2 : 3 + (Math.abs(offset) % 2));
  for (const hora of examenes) {
    const estado = fecha < hoy ? estadoPasado(offset + hora.charCodeAt(0)) : "AGENDADA";
    const persona = elegir("PRIMERA_VEZ", estado);
    if (!persona) continue;
    citas.push([`cit-p-${fecha}-${hora}`, "PRIMERA_VEZ", persona.id, "PRIMER_OTORG_NO_PROF", '["B"]', fecha, hora, estado, 0, "PRESENCIAL", 1, 2, OPERADOR, AHORA, ...tiempos(`cit-p-${fecha}-${hora}`, fecha, hora, estado)]);
    if (estado !== "CANCELADA") sumarUso("PRIMERA_VEZ", fecha, hora);
  }
}

const dias = [];
const bloquesCupo = [];
for (let offset = -52; offset <= 21; offset += 1) {
  const fecha = sumar(hoy, offset);
  const dia = diaIso(fecha);
  if (dia === 7 || FERIADOS.has(fecha)) continue;
  for (const [agenda, lista, capacidad, diario] of [["GENERAL", horasGeneral, 3, 50], ["PRIMERA_VEZ", horasPrimera, 1, 10]]) {
    const usadosDia = Math.min(diario, usados.get(`${agenda}|${fecha}`) ?? 0);
    dias.push([agenda, fecha, diario, usadosDia, 0, 0]);
    for (const hora of lista) {
      const marca = Math.min(capacidad, usados.get(`${agenda}|${fecha}|${hora}`) ?? 0);
      bloquesCupo.push([agenda, fecha, hora, capacidad, marca]);
    }
  }
}

const lineas = [
  `-- Semilla ficticia anclada al ${hoy} (America/Santiago). Sin personas reales.`,
  `-- Aplicar después del esquema, una sentencia por request. La base tiene que estar vacía.`,
  ...bloques(ciudadanos.map((persona) => [persona.id, persona.rut, persona.nombres, persona.apellidos, `${persona.id}@ejemplo.cl`, persona.telefono, 0, AHORA, AHORA]), "id, rut, nombres, apellidos, email, telefono, sin_correo, creado_at, actualizado_at", "ciudadanos"),
  ...bloques(dias, "agenda_id, fecha, capacidad, usados, sobrecupo_tope, sobrecupo_usados", "cupos_dia"),
  ...bloques(bloquesCupo, "agenda_id, fecha, hora, capacidad, usados", "cupos_bloque"),
  ...bloques(citas, "id, agenda_id, ciudadano_id, tipo_tramite_id, clases, fecha, hora, estado, es_sobrecupo, canal, declara_domicilio_recoleta, docs_requeridos, creado_por, creado_at, asistencia_marcada_por, asistencia_at, atencion_at", "citas"),
];

writeFileSync(new URL("../seed/semilla.sql", import.meta.url), `${lineas.join("\n")}\n`);
console.log(`semilla ${hoy}: ${ciudadanos.length} personas, ${citas.length} citas, ${dias.length} días, ${bloquesCupo.length} bloques`);
