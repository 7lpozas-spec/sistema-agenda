export interface PartesLocales {
  fecha: string;
  hora: string;
  minutoDelDia: number;
  diaIso: number;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function partesEnZona(instante: Date, zona: string): PartesLocales {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  });
  const partes = Object.fromEntries(fmt.formatToParts(instante).map((p) => [p.type, p.value]));
  let hour = Number(partes.hour);
  if (hour === 24) hour = 0;
  const fecha = `${partes.year}-${partes.month}-${partes.day}`;
  const hora = `${pad(hour)}:${partes.minute}`;
  const dia = diaIsoDeFecha(fecha);
  return { fecha, hora, minutoDelDia: hour * 60 + Number(partes.minute), diaIso: dia };
}

export function diaIsoDeFecha(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const js = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return js === 0 ? 7 : js;
}

function offsetZona(instante: Date, zona: string): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partes = Object.fromEntries(fmt.formatToParts(instante).map((p) => [p.type, p.value]));
  let hour = Number(partes.hour);
  if (hour === 24) hour = 0;
  const comoUtc = Date.UTC(
    Number(partes.year),
    Number(partes.month) - 1,
    Number(partes.day),
    hour,
    Number(partes.minute),
    Number(partes.second),
  );
  return comoUtc - instante.getTime();
}

/** Convierte una fecha y hora de pared en la zona indicada a un instante UTC. */
export function instanteLocal(fecha: string, hora: string, zona: string): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const pared = Date.UTC(y, m - 1, d, hh, mm, 0);
  const ajuste = offsetZona(new Date(pared), zona);
  const candidato = pared - ajuste;
  const ajuste2 = offsetZona(new Date(candidato), zona);
  return new Date(pared - ajuste2);
}

export function sumarDias(fecha: string, dias: number): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + dias));
  return dt.toISOString().slice(0, 10);
}

export function minutosDeHora(hora: string): number {
  const [hh, mm] = hora.split(":").map(Number);
  return hh * 60 + mm;
}

export function horaDeMinutos(total: number): string {
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function edadEnAnios(nacimiento: string, hoy: string): number {
  const [y, m, d] = nacimiento.split("-").map(Number);
  const [Y, M, D] = hoy.split("-").map(Number);
  let edad = Y - y;
  if (M < m || (M === m && D < d)) edad -= 1;
  return edad;
}

export function fechaValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [y, m, d] = valor.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function domingoDePascua(anio: number): string {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}
