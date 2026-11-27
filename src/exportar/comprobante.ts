import { LOGO_JPEG } from "./logo";
import { armarPdf, anchoTexto, base64ABytes, partirLineas, Pagina, type Color } from "./pdf";
import { modulosQr } from "./qr";

export interface DatosComprobante {
  folio: string;
  estado: string;
  esSobrecupo: boolean;
  nombre: string;
  rut: string;
  tramite: string;
  agenda: "GENERAL" | "PRIMERA_VEZ" | string;
  clases: string[];
  examenTeorico: boolean;
  examenPractico: boolean;
  fecha: string;
  hora: string;
  duracionMin: number;
  direccion: string;
  documentos: string[];
  registradoPor: string;
  registradoAt: string;
  emitidoAt: Date;
}

const TINTA: Color = [24, 40, 62];
const PINO: Color = [23, 43, 70];
const GRIS: Color = [88, 106, 128];
const LINEA: Color = [215, 224, 234];
const FONDO: Color = [241, 245, 250];
const AZUL: Color = [49, 94, 232];
const BLANCO: Color = [255, 255, 255];

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export function fechaLarga(iso: string): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const semana = new Date(Date.UTC(anio, mes - 1, dia)).getUTCDay();
  const nombre = DIAS[semana];
  return `${nombre.charAt(0).toUpperCase()}${nombre.slice(1)} ${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** Fecha y hora de Chile de una marca UTC, como 25-11-2026 15:32. */
export function marcaLocal(valor: string | Date): string {
  const fecha = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(fecha.getTime())) return "";
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(fecha).map((p) => [p.type, p.value]),
  );
  return `${partes.day}-${partes.month}-${partes.year} ${partes.hour}:${partes.minute}`;
}

const ESTADOS: Record<string, { texto: string; color: Color }> = {
  CANCELADA: { texto: "CITA CANCELADA", color: [180, 35, 24] },
  ANULADA: { texto: "CITA ANULADA", color: [180, 35, 24] },
  ASISTIO: { texto: "ASISTENCIA REGISTRADA", color: [20, 108, 67] },
  ATRASADO: { texto: "LLEGÓ ATRASADO", color: [154, 91, 0] },
  NO_ASISTIO: { texto: "NO ASISTIÓ", color: [88, 106, 128] },
};

export function comprobantePdf(datos: DatosComprobante): Uint8Array {
  const pagina = new Pagina(595.28, 841.89);
  const izq = 48;
  const der = 595.28 - 48;
  const ancho = der - izq;

  // Encabezado institucional
  const altoLogo = 44;
  pagina.imagen(izq, 44, (altoLogo * LOGO_JPEG.ancho) / LOGO_JPEG.alto, altoLogo);
  pagina.texto(der, 60, "DIRECCIÓN DE TRÁNSITO", { tamano: 9, fuente: "negrita", color: PINO, alinear: "derecha", espaciado: 0.8 });
  pagina.texto(der, 73, "Departamento de Licencias de Conducir", { tamano: 9, color: GRIS, alinear: "derecha" });
  pagina.texto(der, 86, datos.direccion, { tamano: 8.5, color: GRIS, alinear: "derecha" });
  pagina.rect(izq, 104, ancho, 2.2, { relleno: PINO });

  // Título y folio
  pagina.texto(izq, 142, "Comprobante de cita", { tamano: 22, fuente: "negrita", color: TINTA });
  pagina.texto(izq, 160, `Emitido el ${marcaLocal(datos.emitidoAt)}`, { tamano: 9, color: GRIS });
  pagina.texto(der, 126, "FOLIO", { tamano: 7.5, fuente: "negrita", color: GRIS, alinear: "derecha", espaciado: 1 });
  pagina.texto(der, 146, datos.folio, { tamano: 16, fuente: "negrita", color: TINTA, alinear: "derecha", espaciado: 1.2 });
  const estado = ESTADOS[datos.estado];
  const etiquetas: { texto: string; color: Color }[] = [];
  if (estado) etiquetas.push(estado);
  if (datos.esSobrecupo) etiquetas.push({ texto: "SOBRECUPO", color: [154, 91, 0] });
  let xEtiqueta = der;
  for (const etiqueta of etiquetas) {
    const w = anchoTexto(etiqueta.texto, 7.5, "negrita") + 8 * 0.6 + 16;
    xEtiqueta -= w;
    pagina.rect(xEtiqueta, 153, w, 15, { borde: etiqueta.color, grosor: 1, radio: 7.5 });
    pagina.texto(xEtiqueta + w / 2, 163.6, etiqueta.texto, { tamano: 7.5, fuente: "negrita", color: etiqueta.color, alinear: "centro", espaciado: 0.6 });
    xEtiqueta -= 6;
  }

  // Fecha y hora destacadas, con QR del folio
  const tarjetaY = 182;
  const tarjetaAlto = 128;
  pagina.rect(izq, tarjetaY, ancho, tarjetaAlto, { relleno: FONDO, radio: 10 });
  pagina.rect(izq, tarjetaY, 5, tarjetaAlto, { relleno: AZUL });
  pagina.texto(izq + 26, tarjetaY + 28, "FECHA", { tamano: 7.5, fuente: "negrita", color: GRIS, espaciado: 1 });
  pagina.texto(izq + 26, tarjetaY + 50, fechaLarga(datos.fecha), { tamano: 18, fuente: "negrita", color: TINTA });
  pagina.texto(izq + 26, tarjetaY + 76, "HORA", { tamano: 7.5, fuente: "negrita", color: GRIS, espaciado: 1 });
  const anchoHora = pagina.texto(izq + 26, tarjetaY + 110, datos.hora, { tamano: 34, fuente: "negrita", color: PINO });
  pagina.texto(izq + 26 + anchoHora + 10, tarjetaY + 108, "horas", { tamano: 11, color: GRIS });
  const nombreAgenda = datos.agenda === "PRIMERA_VEZ" ? "Agenda Primera Vez" : "Agenda General";
  pagina.texto(izq + 26 + anchoHora + 10 + anchoTexto("horas", 11) + 18, tarjetaY + 108, `${nombreAgenda} · ${datos.duracionMin} min`, { tamano: 10, color: GRIS });
  const ladoQr = 92;
  const xQr = der - 20 - ladoQr;
  const yQr = tarjetaY + (tarjetaAlto - ladoQr) / 2;
  pagina.rect(xQr - 6, yQr - 6, ladoQr + 12, ladoQr + 12, { relleno: BLANCO, radio: 6 });
  pagina.matriz(xQr, yQr, ladoQr, modulosQr(datos.folio), TINTA);

  let y = tarjetaY + tarjetaAlto + 40;
  const columna2 = izq + ancho * 0.58;
  const anchoCol1 = columna2 - izq - 20;
  const seccion = (titulo: string) => {
    pagina.texto(izq, y, titulo.toUpperCase(), { tamano: 8, fuente: "negrita", color: AZUL, espaciado: 1.1 });
    pagina.linea(izq, y + 7, der, y + 7, LINEA, 0.8);
    y += 26;
  };
  const campo = (x: number, yy: number, etiqueta: string, valor: string, anchoMax: number): number => {
    pagina.texto(x, yy, etiqueta, { tamano: 8, color: GRIS });
    const lineas = partirLineas(valor || "—", 11.5, anchoMax, "negrita");
    lineas.forEach((linea, i) => pagina.texto(x, yy + 15 + i * 14, linea, { tamano: 11.5, fuente: "negrita", color: TINTA }));
    return yy + 15 + (lineas.length - 1) * 14;
  };

  seccion("Persona");
  const finPersona = Math.max(campo(izq, y, "Nombre", datos.nombre, anchoCol1), campo(columna2, y, "RUT", datos.rut, der - columna2));
  y = finPersona + 34;

  seccion("Trámite");
  const examenes = datos.examenTeorico && datos.examenPractico ? "Teórico y práctico" : datos.examenTeorico ? "Teórico" : datos.examenPractico ? "Práctico" : "No aplica";
  const fin1 = Math.max(campo(izq, y, "Trámite", datos.tramite, anchoCol1), campo(columna2, y, "Agenda", nombreAgenda, der - columna2));
  y = fin1 + 24;
  const fin2 = Math.max(
    campo(izq, y, "Clase", datos.clases.length ? datos.clases.map((c) => `Clase ${c}`).join(", ") : "—", anchoCol1),
    campo(columna2, y, "Exámenes", examenes, der - columna2),
  );
  y = fin2 + 34;

  seccion("Lugar de atención");
  const finLugar = campo(izq, y, "Dirección de Tránsito, Municipalidad de Recoleta", datos.direccion, ancho);
  y = finLugar + 34;

  // Documentos e indicaciones en dos columnas
  const yBloque = y;
  pagina.texto(izq, y, "DEBE PRESENTAR", { tamano: 8, fuente: "negrita", color: AZUL, espaciado: 1.1 });
  pagina.texto(columna2, y, "INDICACIONES", { tamano: 8, fuente: "negrita", color: AZUL, espaciado: 1.1 });
  pagina.linea(izq, y + 7, der, y + 7, LINEA, 0.8);
  let yDocs = yBloque + 28;
  for (const doc of datos.documentos) {
    pagina.rect(izq, yDocs - 9, 10, 10, { borde: PINO, grosor: 1, radio: 2 });
    yDocs = pagina.parrafo(izq + 18, yDocs, anchoCol1 - 18, doc, { tamano: 10.5, color: TINTA, interlineado: 14 }) + 6;
  }
  const indicaciones = [
    "Llegue 10 minutos antes de su hora.",
    "Presente los documentos originales y vigentes.",
    "La atención es personal y presencial.",
    "Para cambiar o cancelar su hora, acérquese a la Dirección de Tránsito.",
  ];
  let yInd = yBloque + 28;
  for (const texto of indicaciones) {
    pagina.rect(columna2, yInd - 5.5, 3.5, 3.5, { relleno: AZUL });
    yInd = pagina.parrafo(columna2 + 12, yInd, der - columna2 - 12, texto, { tamano: 9.5, color: TINTA, interlineado: 13 }) + 5;
  }

  // Corte y pie
  const yPie = 841.89 - 64;
  pagina.linea(izq, yPie - 14, der, yPie - 14, LINEA, 0.8);
  pagina.texto(izq, yPie, `Registrado por ${datos.registradoPor}${datos.registradoAt ? ` el ${marcaLocal(datos.registradoAt)}` : ""}`, { tamano: 8.5, color: GRIS });
  pagina.texto(izq, yPie + 12, `Folio ${datos.folio}`, { tamano: 8.5, color: GRIS });
  pagina.texto(der, yPie, "Municipalidad de Recoleta", { tamano: 8.5, fuente: "negrita", color: PINO, alinear: "derecha" });
  pagina.texto(der, yPie + 12, "Somos todos", { tamano: 8.5, color: GRIS, alinear: "derecha" });

  return armarPdf([pagina], {
    titulo: `Comprobante de cita ${datos.folio}`,
    imagen: { ancho: LOGO_JPEG.ancho, alto: LOGO_JPEG.alto, jpeg: base64ABytes(LOGO_JPEG.base64) },
  });
}
