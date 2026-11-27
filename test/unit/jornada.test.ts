import { describe, expect, it } from "vitest";
import { asignarHuecos } from "../../src/servicios/jornada";

describe("reubicación", () => {
  it("reparte los cupos libres sin repetir un asiento", () => {
    const propuestas = asignarHuecos(
      [
        { id: "a", hora: "08:30", nombre: "Ana" },
        { id: "b", hora: "08:45", nombre: "Benito" },
        { id: "c", hora: "09:00", nombre: "Carla" },
      ],
      [
        { fecha: "2026-11-27", hora: "10:00", libres: 2 },
        { fecha: "2026-11-28", hora: "08:30", libres: 1 },
      ],
    );
    expect(propuestas.map((fila) => `${fila.citaId} ${fila.fecha} ${fila.hora}`)).toEqual([
      "a 2026-11-27 10:00",
      "b 2026-11-27 10:00",
      "c 2026-11-28 08:30",
    ]);
  });
});
