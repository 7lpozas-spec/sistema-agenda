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
});