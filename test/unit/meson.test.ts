import { describe, expect, it } from "vitest";
import { esEstadoMeson, idServicio, numeroTexto, porHoraLocal, transicionValida } from "../../src/servicios/meson";
import { puedeAtenderMeson } from "../../src/domain/permisos";

describe("mesón sin hora", () => {
  it("permite solo los pasos definidos", () => {
    expect(transicionValida("EN_ESPERA", "EN_ATENCION")).toBe(true);
    expect(transicionValida("EN_ESPERA", "ATENDIDO")).toBe(true);
    expect(transicionValida("EN_ESPERA", "SE_RETIRO")).toBe(true);
    expect(transicionValida("EN_ATENCION", "ATENDIDO")).toBe(true);
    expect(transicionValida("ATENDIDO", "EN_ESPERA")).toBe(true);
    expect(transicionValida("ATENDIDO", "SE_RETIRO")).toBe(false);
    expect(transicionValida("SE_RETIRO", "ATENDIDO")).toBe(false);
    expect(transicionValida("EN_ESPERA", "EN_ESPERA")).toBe(false);
    expect(esEstadoMeson("EN_ESPERA")).toBe(true);
    expect(esEstadoMeson("CERRADO")).toBe(false);
  });

  it("arma identificadores y números legibles", () => {
    expect(idServicio("Cambio de domicilio y datos")).toBe("CAMBIO_DE_DOMICILIO_Y_DATOS");
    expect(idServicio("  Información / Ñandú ")).toBe("INFORMACION_NANDU");
    expect(idServicio("¿¿??")).toBe("SERVICIO");
    expect(numeroTexto(7)).toBe("S-007");
    expect(numeroTexto(123)).toBe("S-123");
  });

  it("agrupa llegadas por hora de Chile", () => {
    expect(porHoraLocal(["2026-11-25T12:05:00.000Z", "2026-11-25T12:55:00.000Z", "2026-11-25T14:10:00.000Z", "no-es-fecha"]))
      .toEqual([{ hora: "09:00", n: 2 }, { hora: "11:00", n: 1 }]);
  });

  it("solo administración y recepción atienden", () => {
    expect(puedeAtenderMeson("ADMIN")).toBe(true);
    expect(puedeAtenderMeson("RECEPCION")).toBe(true);
    expect(puedeAtenderMeson("OPERADOR_AGENDA")).toBe(false);
    expect(puedeAtenderMeson("INSTRUCTOR")).toBe(false);
  });
});
