import { describe, expect, it } from "vitest";
import { comprobanteDisponible, resumirDocumentos } from "../../src/servicios/documentos";
import { piezasConCambios, type Pieza } from "../../src/servicios/generar";
import { puedeFotografiar } from "../../src/domain/permisos";

describe("documentos de la cita", () => {
  it("lista lo que falta según el trámite", () => {
    const control = resumirDocumentos({ requiere_carnet: 1, requiere_licencia: 1 }, ["CARNET_FRENTE", "FOTO_CIUDADANO"]);
    expect(control.requeridos).toHaveLength(4);
    expect(control.listos).toEqual(["CARNET_FRENTE"]);
    expect(control.faltantes).toEqual(["CARNET_REVERSO", "LICENCIA_FRENTE", "LICENCIA_REVERSO"]);
    expect(resumirDocumentos({ requiere_carnet: 1, requiere_licencia: 0 }, []).faltantes).toEqual(["CARNET_FRENTE", "CARNET_REVERSO"]);
    expect(resumirDocumentos(null, []).requeridos).toEqual([]);
  });

  it("emite el comprobante solo con los documentos completos, salvo canceladas", () => {
    expect(comprobanteDisponible("AGENDADA", ["CARNET_REVERSO"])).toBe(false);
    expect(comprobanteDisponible("AGENDADA", [])).toBe(true);
    expect(comprobanteDisponible("ATENDIDA", ["LICENCIA_FRENTE"])).toBe(false);
    expect(comprobanteDisponible("CANCELADA", ["CARNET_FRENTE"])).toBe(true);
    expect(comprobanteDisponible("ANULADA", ["CARNET_FRENTE"])).toBe(true);
  });

  it("recepción puede fotografiar", () => {
    expect(puedeFotografiar("RECEPCION", "GENERAL")).toBe(true);
    expect(puedeFotografiar("RECEPCION", "PRIMERA_VEZ")).toBe(true);
    expect(puedeFotografiar("INSTRUCTOR", "GENERAL")).toBe(false);
  });
});

describe("regeneración de cupos", () => {
  const db = (dias: unknown[], bloques: unknown[]) => ({
    prepare: (sql: string) => ({
      bind: () => ({ all: async () => ({ results: sql.includes("cupos_bloque") ? bloques : dias }) }),
    }),
  }) as unknown as D1Database;

  it("no reescribe cupos sin cambios", async () => {
    const piezas: Pieza[] = [
      { agendaId: "GENERAL", fecha: "2026-12-01", hora: null, capacidad: 0, cupoDiario: 40 },
      { agendaId: "GENERAL", fecha: "2026-12-01", hora: "08:30", capacidad: 3, cupoDiario: 40 },
      { agendaId: "GENERAL", fecha: "2026-12-01", hora: "08:45", capacidad: 3, cupoDiario: 40 },
      { agendaId: "GENERAL", fecha: "2026-12-01", hora: "09:00", capacidad: 2, cupoDiario: 40 },
      { agendaId: "GENERAL", fecha: "2026-12-02", hora: "08:30", capacidad: 3, cupoDiario: 40 },
    ];
    const dias = [{ agenda_id: "GENERAL", fecha: "2026-12-01", capacidad: 40, usados: 2 }];
    const bloques = [
      { agenda_id: "GENERAL", fecha: "2026-12-01", hora: "08:30", capacidad: 3, usados: 1 },
      { agenda_id: "GENERAL", fecha: "2026-12-01", hora: "08:45", capacidad: 4, usados: 4 },
      { agenda_id: "GENERAL", fecha: "2026-12-01", hora: "09:00", capacidad: 3, usados: 0 },
    ];
    const cambios = await piezasConCambios(db(dias, bloques), piezas, "2026-11-25");
    expect(cambios.map((pieza) => `${pieza.fecha} ${pieza.hora}`)).toEqual(["2026-12-01 09:00", "2026-12-02 08:30"]);
  });
});
