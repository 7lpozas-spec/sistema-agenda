function crc32(datos: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of datos) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

function u16(valor: number): Uint8Array {
  return new Uint8Array([valor & 255, (valor >> 8) & 255]);
}
function u32(valor: number): Uint8Array {
  return new Uint8Array([valor & 255, (valor >> 8) & 255, (valor >> 16) & 255, (valor >> 24) & 255]);
}
function unir(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((suma, parte) => suma + parte.byteLength, 0);
  const salida = new Uint8Array(total);
  let cursor = 0;
  for (const parte of partes) {
    salida.set(parte, cursor);
    cursor += parte.byteLength;
  }
  return salida;
}

function xml(valor: string): string {
  return valor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export interface Hoja {
  nombre: string;
  filas: string[][];
}

export function libroXlsx(hojas: Hoja[]): Uint8Array {
  const encoder = new TextEncoder();
  const archivos: { nombre: string; datos: Uint8Array }[] = [];
  const tipos = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`;
  archivos.push({ nombre: "[Content_Types].xml", datos: encoder.encode(tipos) });
  archivos.push({
    nombre: "_rels/.rels",
    datos: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
  });
  const hojasXml = hojas
    .map((hoja, i) => `<sheet name="${xml(hoja.nombre.slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
    .join("");
  archivos.push({
    nombre: "xl/workbook.xml",
    datos: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${hojasXml}</sheets>
</workbook>`),
  });
  archivos.push({
    nombre: "xl/_rels/workbook.xml.rels",
    datos: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
</Relationships>`),
  });
  hojas.forEach((hoja, indice) => {
    const filas = hoja.filas
      .map((fila, f) => {
        const celdas = fila
          .map((valor, c) => `<c r="${columna(c)}${f + 1}" t="inlineStr"><is><t>${xml(valor)}</t></is></c>`)
          .join("");
        return `<row r="${f + 1}">${celdas}</row>`;
      })
      .join("");
    archivos.push({
      nombre: `xl/worksheets/sheet${indice + 1}.xml`,
      datos: encoder.encode(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${filas}</sheetData></worksheet>`),
    });
  });
  return zipAlmacenado(archivos);
}

function columna(indice: number): string {
  let n = indice + 1;
  let nombre = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    nombre = String.fromCharCode(65 + resto) + nombre;
    n = Math.floor((n - 1) / 26);
  }
  return nombre;
}

function zipAlmacenado(archivos: { nombre: string; datos: Uint8Array }[]): Uint8Array {
  const encoder = new TextEncoder();
  const locales: Uint8Array[] = [];
  const centrales: Uint8Array[] = [];
  let offset = 0;
  for (const archivo of archivos) {
    const nombre = encoder.encode(archivo.nombre);
    const crc = crc32(archivo.datos);
    const local = unir([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(archivo.datos.byteLength), u32(archivo.datos.byteLength),
      u16(nombre.byteLength), u16(0), nombre, archivo.datos,
    ]);
    const central = unir([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(archivo.datos.byteLength), u32(archivo.datos.byteLength),
      u16(nombre.byteLength), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset), nombre,
    ]);
    locales.push(local);
    centrales.push(central);
    offset += local.byteLength;
  }
  const centralBytes = unir(centrales);
  const eocd = unir([
    u32(0x06054b50), u16(0), u16(0), u16(archivos.length), u16(archivos.length),
    u32(centralBytes.byteLength), u32(offset), u16(0),
  ]);
  return unir([...locales, centralBytes, eocd]);
}

/** Octal de un byte WinAnsi (Windows-1252) dentro de un literal PDF. */
function octal(byte: number): string {
  return `\\${byte.toString(8).padStart(3, "0")}`;
}

const WIN: Record<string, string> = {
  á: octal(0xe1), é: octal(0xe9), í: octal(0xed), ó: octal(0xf3), ú: octal(0xfa), ñ: octal(0xf1), ü: octal(0xfc),
  Á: octal(0xc1), É: octal(0xc9), Í: octal(0xcd), Ó: octal(0xd3), Ú: octal(0xda), Ñ: octal(0xd1), Ü: octal(0xdc),
  "¿": octal(0xbf), "¡": octal(0xa1), "°": octal(0xb0), "º": octal(0xba), "ª": octal(0xaa), "·": octal(0xb7),
  "«": octal(0xab), "»": octal(0xbb), "–": octal(0x96), "—": octal(0x97),
  "‘": octal(0x91), "’": octal(0x92), "“": octal(0x93), "”": octal(0x94), "…": octal(0x85),
};

function pdfTexto(valor: string): string {
  return valor
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7e]/g, (caracter) => WIN[caracter] ?? "?");
}

export function reportePdf(titulo: string, lineas: string[]): Uint8Array {
  const porPagina = 42;
  const paginas: string[][] = [];
  const todas = [titulo, "", ...lineas];
  for (let i = 0; i < todas.length; i += porPagina) paginas.push(todas.slice(i, i + porPagina));
  if (paginas.length === 0) paginas.push([titulo]);
  const objetos: string[] = [];
  const idsPagina: number[] = [];
  let siguiente = 3;
  const contenidos: { id: number; stream: string }[] = [];
  for (const pagina of paginas) {
    const id = siguiente;
    siguiente += 1;
    idsPagina.push(id);
    const comandos = ["BT", "/F1 11 Tf", "40 800 Td", "14 TL"];
    pagina.forEach((linea, indice) => {
      const texto = pdfTexto(linea.slice(0, 110));
      if (indice === 0) comandos.push(`(${texto}) Tj`);
      else comandos.push(`T* (${texto}) Tj`);
    });
    comandos.push("ET");
    contenidos.push({ id: siguiente, stream: comandos.join("\n") });
    siguiente += 1;
  }
  const fuente = siguiente;
  objetos.push("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj");
  objetos.push(`2 0 obj << /Type /Pages /Count ${idsPagina.length} /Kids [${idsPagina.map((id) => `${id} 0 R`).join(" ")}] >> endobj`);
  idsPagina.forEach((id, indice) => {
    objetos.push(
      `${id} 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${contenidos[indice].id} 0 R /Resources << /Font << /F1 ${fuente} 0 R >> >> >> endobj`,
    );
    const stream = contenidos[indice].stream;
    const largo = new TextEncoder().encode(stream).byteLength;
    objetos.push(`${contenidos[indice].id} 0 obj << /Length ${largo} >> stream\n${stream}\nendstream endobj`);
  });
  objetos.push(`${fuente} 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >> endobj`);
  let cuerpo = "%PDF-1.4\n";
  const offsets = [0];
  for (const objeto of objetos) {
    offsets.push(cuerpo.length);
    cuerpo += `${objeto}\n`;
  }
  const xref = cuerpo.length;
  let tabla = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) tabla += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  cuerpo += `${tabla}trailer << /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(cuerpo);
}
