/**
 * PDF mínimo con Helvetica en WinAnsi, rectángulos, líneas e imagen JPEG.
 * Todo el archivo queda en ASCII: el texto va con escapes octales y la imagen en hexadecimal.
 */
const HELV = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const HELV_BOLD = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];

export type Fuente = "normal" | "negrita";
export type Color = [number, number, number];

const ESPECIALES: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** Bytes Windows-1252 de un texto. Lo que no existe en WinAnsi queda como "?". */
export function winAnsi(texto: string): number[] {
  const salida: number[] = [];
  for (const caracter of texto.normalize("NFC")) {
    const punto = caracter.codePointAt(0) ?? 63;
    if (punto >= 0x20 && punto <= 0x7e) salida.push(punto);
    else if (punto >= 0xa0 && punto <= 0xff) salida.push(punto);
    else if (ESPECIALES[punto]) salida.push(ESPECIALES[punto]);
    else if (punto === 0x09 || punto === 0x0a) salida.push(0x20);
    else salida.push(63);
  }
  return salida;
}

function literal(texto: string): string {
  return winAnsi(texto)
    .map((byte) => {
      if (byte === 0x28 || byte === 0x29 || byte === 0x5c) return `\\${String.fromCharCode(byte)}`;
      if (byte >= 0x20 && byte <= 0x7e) return String.fromCharCode(byte);
      return `\\${byte.toString(8).padStart(3, "0")}`;
    })
    .join("");
}

export function anchoTexto(texto: string, tamano: number, fuente: Fuente = "normal"): number {
  const tabla = fuente === "negrita" ? HELV_BOLD : HELV;
  return (winAnsi(texto).reduce((suma, byte) => suma + (tabla[byte] || 556), 0) * tamano) / 1000;
}

/** Corta un párrafo en líneas que caben en el ancho dado. */
export function partirLineas(texto: string, tamano: number, ancho: number, fuente: Fuente = "normal"): string[] {
  const lineas: string[] = [];
  for (const parrafo of texto.split("\n")) {
    let actual = "";
    for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
      const prueba = actual ? `${actual} ${palabra}` : palabra;
      if (anchoTexto(prueba, tamano, fuente) <= ancho || !actual) actual = prueba;
      else {
        lineas.push(actual);
        actual = palabra;
      }
    }
    lineas.push(actual);
  }
  return lineas;
}

function n(valor: number): string {
  return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
function rgb(color: Color): string {
  return color.map((c) => n(c / 255)).join(" ");
}

export interface OpcionesTexto {
  tamano?: number;
  fuente?: Fuente;
  color?: Color;
  alinear?: "izquierda" | "centro" | "derecha";
  espaciado?: number;
}

export interface Imagen {
  ancho: number;
  alto: number;
  jpeg: Uint8Array;
}

/** Una página. Las coordenadas parten arriba a la izquierda, en puntos. */
export class Pagina {
  readonly comandos: string[] = [];
  usaImagen = false;
  constructor(readonly ancho: number, readonly alto: number) {}

  private y(valor: number): number {
    return this.alto - valor;
  }

  rect(x: number, y: number, w: number, h: number, opciones: { relleno?: Color; borde?: Color; grosor?: number; radio?: number }): void {
    const { relleno, borde, grosor = 0.75, radio = 0 } = opciones;
    const partes: string[] = ["q"];
    if (relleno) partes.push(`${rgb(relleno)} rg`);
    if (borde) partes.push(`${rgb(borde)} RG ${n(grosor)} w`);
    partes.push(radio > 0 ? this.trazoRedondeado(x, y, w, h, radio) : `${n(x)} ${n(this.y(y + h))} ${n(w)} ${n(h)} re`);
    partes.push(relleno && borde ? "B" : relleno ? "f" : "S");
    partes.push("Q");
    this.comandos.push(partes.join("\n"));
  }

  private trazoRedondeado(x: number, y: number, w: number, h: number, r: number): string {
    const k = 0.5523 * r;
    const x0 = x;
    const x1 = x + w;
    const y0 = this.y(y + h);
    const y1 = this.y(y);
    return [
      `${n(x0 + r)} ${n(y0)} m`,
      `${n(x1 - r)} ${n(y0)} l`,
      `${n(x1 - r + k)} ${n(y0)} ${n(x1)} ${n(y0 + r - k)} ${n(x1)} ${n(y0 + r)} c`,
      `${n(x1)} ${n(y1 - r)} l`,
      `${n(x1)} ${n(y1 - r + k)} ${n(x1 - r + k)} ${n(y1)} ${n(x1 - r)} ${n(y1)} c`,
      `${n(x0 + r)} ${n(y1)} l`,
      `${n(x0 + r - k)} ${n(y1)} ${n(x0)} ${n(y1 - r + k)} ${n(x0)} ${n(y1 - r)} c`,
      `${n(x0)} ${n(y0 + r)} l`,
      `${n(x0)} ${n(y0 + r - k)} ${n(x0 + r - k)} ${n(y0)} ${n(x0 + r)} ${n(y0)} c`,
      "h",
    ].join("\n");
  }

  linea(x1: number, y1: number, x2: number, y2: number, color: Color, grosor = 0.75, guiones?: [number, number]): void {
    this.comandos.push(`q ${rgb(color)} RG ${n(grosor)} w ${guiones ? `[${guiones[0]} ${guiones[1]}] 0 d ` : ""}${n(x1)} ${n(this.y(y1))} m ${n(x2)} ${n(this.y(y2))} l S Q`);
  }

  /** y es la línea base del texto. */
  texto(x: number, y: number, valor: string, opciones: OpcionesTexto = {}): number {
    const { tamano = 10, fuente = "normal", color = [24, 40, 62], alinear = "izquierda", espaciado = 0 } = opciones;
    const ancho = anchoTexto(valor, tamano, fuente) + espaciado * Math.max(0, [...valor].length - 1);
    const inicio = alinear === "centro" ? x - ancho / 2 : alinear === "derecha" ? x - ancho : x;
    this.comandos.push(
      `BT /${fuente === "negrita" ? "F2" : "F1"} ${n(tamano)} Tf ${rgb(color)} rg ${n(espaciado)} Tc ${n(inicio)} ${n(this.y(y))} Td (${literal(valor)}) Tj ET`,
    );
    return ancho;
  }

  /** Párrafo con salto de línea automático. Devuelve la y de la línea siguiente. */
  parrafo(x: number, y: number, ancho: number, valor: string, opciones: OpcionesTexto & { interlineado?: number } = {}): number {
    const tamano = opciones.tamano ?? 10;
    const paso = opciones.interlineado ?? tamano * 1.4;
    let cursor = y;
    for (const linea of partirLineas(valor, tamano, ancho, opciones.fuente)) {
      this.texto(x, cursor, linea, opciones);
      cursor += paso;
    }
    return cursor;
  }

  imagen(x: number, y: number, w: number, h: number): void {
    this.usaImagen = true;
    this.comandos.push(`q ${n(w)} 0 0 ${n(h)} ${n(x)} ${n(this.y(y + h))} cm /Im1 Do Q`);
  }

  /** Matriz de módulos (por ejemplo un QR), dibujada como cuadros. */
  matriz(x: number, y: number, lado: number, modulos: boolean[][], color: Color): void {
    const tam = modulos.length;
    const paso = lado / tam;
    const partes = [`q ${rgb(color)} rg`];
    modulos.forEach((fila, f) => {
      let inicio = -1;
      for (let c = 0; c <= tam; c += 1) {
        const lleno = c < tam && fila[c];
        if (lleno && inicio < 0) inicio = c;
        if (!lleno && inicio >= 0) {
          partes.push(`${n(x + inicio * paso)} ${n(this.y(y + (f + 1) * paso))} ${n((c - inicio) * paso + 0.02)} ${n(paso + 0.02)} re`);
          inicio = -1;
        }
      }
    });
    partes.push("f Q");
    this.comandos.push(partes.join("\n"));
  }
}

function hex(bytes: Uint8Array): string {
  let salida = "";
  for (let i = 0; i < bytes.length; i += 1) {
    salida += bytes[i].toString(16).padStart(2, "0");
    if (i % 64 === 63) salida += "\n";
  }
  return `${salida}>`;
}

export function armarPdf(paginas: Pagina[], opciones: { titulo: string; imagen?: Imagen }): Uint8Array {
  const objetos: string[] = [];
  const agregar = (cuerpo: string): number => {
    objetos.push(cuerpo);
    return objetos.length;
  };
  const catalogo = agregar("");
  const arbol = agregar("");
  const f1 = agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = agregar("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  let imagen = 0;
  if (opciones.imagen && paginas.some((p) => p.usaImagen)) {
    const datos = hex(opciones.imagen.jpeg);
    imagen = agregar(
      `<< /Type /XObject /Subtype /Image /Width ${opciones.imagen.ancho} /Height ${opciones.imagen.alto} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter [/ASCIIHexDecode /DCTDecode] /Length ${datos.length} >>\nstream\n${datos}\nendstream`,
    );
  }
  const hijos: number[] = [];
  for (const pagina of paginas) {
    const flujo = pagina.comandos.join("\n");
    const contenido = agregar(`<< /Length ${flujo.length} >>\nstream\n${flujo}\nendstream`);
    const recursos = `<< /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${imagen && pagina.usaImagen ? ` /XObject << /Im1 ${imagen} 0 R >>` : ""} >>`;
    hijos.push(agregar(`<< /Type /Page /Parent ${arbol} 0 R /MediaBox [0 0 ${n(pagina.ancho)} ${n(pagina.alto)}] /Contents ${contenido} 0 R /Resources ${recursos} >>`));
  }
  objetos[catalogo - 1] = `<< /Type /Catalog /Pages ${arbol} 0 R >>`;
  objetos[arbol - 1] = `<< /Type /Pages /Count ${hijos.length} /Kids [${hijos.map((id) => `${id} 0 R`).join(" ")}] >>`;
  const info = agregar(`<< /Title (${literal(opciones.titulo)}) /Producer (Municipalidad de Recoleta) >>`);
  let cuerpo = "%PDF-1.4\n";
  const offsets: number[] = [];
  objetos.forEach((objeto, i) => {
    offsets.push(cuerpo.length);
    cuerpo += `${i + 1} 0 obj\n${objeto}\nendobj\n`;
  });
  const xref = cuerpo.length;
  let tabla = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) tabla += `${String(offset).padStart(10, "0")} 00000 n \n`;
  cuerpo += `${tabla}trailer\n<< /Size ${objetos.length + 1} /Root ${catalogo} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(cuerpo);
}

export function base64ABytes(base64: string): Uint8Array {
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return bytes;
}
