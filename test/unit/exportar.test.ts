import { describe, expect, it } from "vitest";
import { libroXlsx, reportePdf } from "../../src/exportar/documentos";

describe("exportaciones", () => {
  it("arma un xlsx y un pdf que Excel y un visor pueden abrir", () => {
    const xlsx = libroXlsx([{ nombre: "Indicadores", filas: [["Citas", "3"], ["Día", "25-11-2026"]] }]);
    expect(xlsx[0]).toBe(0x50);
    expect(xlsx[1]).toBe(0x4b);
    expect(xlsx.byteLength).toBeGreaterThan(200);
    const pdf = reportePdf("Reporte", ["Citas del día: 3", "Niña de prueba"]);
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
  });

  it("escribe ·, tildes, ñ, º, raya y comillas en WinAnsi", () => {
    const linea = "Municipalidad de Recoleta · Dirección de Tránsito – Niña nº 2º, “cita” y ‘hora’";
    const pdf = new TextDecoder().decode(reportePdf("Comprobante", [linea]));
    expect(pdf).not.toContain("?");
    expect(textoDe(pdf)).toContain(linea);
  });
});

const WINANSI: Record<number, string> = {
  0x85: "…", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x96: "–", 0x97: "—",
  0xaa: "ª", 0xab: "«", 0xb0: "°", 0xb7: "·", 0xba: "º", 0xbb: "»",
  0xc1: "Á", 0xc9: "É", 0xcd: "Í", 0xd1: "Ñ", 0xd3: "Ó", 0xda: "Ú", 0xdc: "Ü",
  0xe1: "á", 0xe9: "é", 0xed: "í", 0xf1: "ñ", 0xf3: "ó", 0xfa: "ú", 0xfc: "ü",
  0xbf: "¿", 0xa1: "¡",
};

function textoDe(pdf: string): string {
  const literal = /\((?:\\[0-7]{1,3}|\\.|[^\\)])*\)/g;
  return [...pdf.matchAll(literal)].map((coincidencia) => {
    const cuerpo = coincidencia[0].slice(1, -1);
    const bytes: number[] = [];
    for (let i = 0; i < cuerpo.length; i += 1) {
      if (cuerpo[i] !== "\\") {
        bytes.push(cuerpo.charCodeAt(i));
        continue;
      }
      const octal = /^[0-7]{1,3}/.exec(cuerpo.slice(i + 1));
      if (octal) {
        bytes.push(Number.parseInt(octal[0], 8));
        i += octal[0].length;
        continue;
      }
      bytes.push(cuerpo.charCodeAt(i + 1));
      i += 1;
    }
    return bytes.map((byte) => WINANSI[byte] ?? String.fromCharCode(byte)).join("");
  }).join("\n");
}