import { describe, expect, it } from "vitest";
import { comprobantePdf, fechaLarga, marcaLocal } from "../../src/exportar/comprobante";
import { anchoTexto, partirLineas, winAnsi } from "../../src/exportar/pdf";

const base = {
  folio: "AB12CD34", estado: "AGENDADA", esSobrecupo: false, nombre: "Nora Ficticia Ejemplo", rut: "31.000.101-K",
  tramite: "Control / Renovación", agenda: "GENERAL", clases: ["B"], examenTeorico: true, examenPractico: false,
  fecha: "2026-11-26", hora: "09:15", duracionMin: 15, direccion: "Av. Recoleta 2774, Recoleta",
  documentos: ["Cédula de identidad vigente", "Licencia de conducir anterior"],
  registradoPor: "Operadora Ficticia", registradoAt: "2026-11-25T13:30:00.000Z", emitidoAt: new Date("2026-11-25T14:00:00.000Z"),
};

describe("comprobante", () => {
  it("codifica en WinAnsi y mide texto", () => {
    expect(winAnsi("ñ·–")).toEqual([0xf1, 0xb7, 0x96]);
    expect(anchoTexto("Recoleta", 10, "negrita")).toBeGreaterThan(anchoTexto("Recoleta", 10));
    expect(partirLineas("Llegue diez minutos antes con su cédula de identidad vigente y la licencia anterior.", 10, 120).length).toBeGreaterThan(1);
  });

  it("formatea fechas en hora de Chile", () => {
    expect(fechaLarga("2026-11-26")).toBe("Jueves 26 de noviembre de 2026");
    expect(marcaLocal("2026-11-25T13:30:00.000Z")).toBe("25-11-2026 10:30");
  });

  it("arma un PDF de una página con logo y los datos de la cita", () => {
    const pdf = comprobantePdf(base);
    const texto = new TextDecoder("latin1").decode(pdf);
    expect(texto.startsWith("%PDF-1.")).toBe(true);
    expect(texto).toContain("/DCTDecode");
    expect(texto).toContain("/WinAnsiEncoding");
    expect(texto.match(/\/Type \/Page\b/g)).toHaveLength(1);
    expect(texto).toContain("AB12CD34");
    expect(texto).toContain("09:15");
    expect(texto).toContain("Nora Ficticia Ejemplo");
    expect(texto).toContain("Operadora Ficticia");
    expect(texto.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("marca citas canceladas y sobrecupos", () => {
    const texto = new TextDecoder("latin1").decode(comprobantePdf({ ...base, estado: "CANCELADA", esSobrecupo: true }));
    expect(texto).toContain("CANCELADA");
    expect(texto).toContain("SOBRECUPO");
  });
});
