import { describe, expect, it } from "vitest";
import { bytesDeBlob, comprobanteDisponible, resumirDocumentos } from "../../src/servicios/documentos";
import { piezasConCambios, type Pieza } from "../../src/servicios/generar";
import { puedeFotografiar } from "../../src/domain/permisos";

describe("documentos de la cita", () => {
  it("lista lo que falta según el trámite", () => {
    const control = resumirDocumentos({ agenda_id: "GENERAL", tipo: { id: "CONTROL_RENOVACION", requiere_carnet: 1, requiere_licencia: 1 } }, ["CARNET_FRENTE", "FOTO_CIUDADANO"]);
    expect(control.requeridos).toHaveLength(4);
    expect(control.listos).toEqual(["CARNET_FRENTE"]);
    expect(control.faltantes).toEqual(["CARNET_REVERSO", "LICENCIA_FRENTE", "LICENCIA_REVERSO"]);
    expect(resumirDocumentos({ agenda_id: "GENERAL", tipo: { id: "PRIMER_OTORG_NO_PROF", requiere_carnet: 1, requiere_licencia: 0 } }, []).faltantes).toEqual(["CARNET_FRENTE", "CARNET_REVERSO"]);
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

describe("foto guardada en D1", () => {
  it("lee el BLOB como arreglo de números (D1 remoto) o como ArrayBuffer (local)", () => {
    const remoto = bytesDeBlob([0xff, 0xd8, 0xff, 0xe0]);
    expect(remoto && Array.from(new Uint8Array(remoto))).toEqual([0xff, 0xd8, 0xff, 0xe0]);
    const local = new Uint8Array([1, 2, 3]).buffer;
    expect(bytesDeBlob(local)).toBe(local);
    const vista = new Uint8Array([9, 8, 7, 6]).subarray(1, 3);
    expect(Array.from(new Uint8Array(bytesDeBlob(vista) as ArrayBuffer))).toEqual([8, 7]);
    expect(bytesDeBlob(null)).toBeNull();
    expect(bytesDeBlob([])).toBeNull();
    expect(bytesDeBlob(new ArrayBuffer(0))).toBeNull();
  });
});
