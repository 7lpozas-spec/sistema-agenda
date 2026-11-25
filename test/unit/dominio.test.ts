import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluarTipo } from "../../src/domain/reglas";
import { capacidadExaminador, generarDias, horasDeBloque } from "../../src/domain/cupos";
import { digitoVerificador, enmascararRut, formatearRut, normalizarRut } from "../../src/domain/rut";
import { tieneExif, quitarExif } from "../../src/domain/exif";
import { diaIsoDeFecha, domingoDePascua } from "../../src/domain/tiempo";
import type { TipoTramite } from "../../src/domain/catalogo";

const control = {
  id: "CONTROL_RENOVACION", nombre: "Control / Renovación", requiere_agenda: 1, agenda_id: "GENERAL",
  duracion_slot_min: null, cupos_que_consume: 1, examen_teorico: 0, examen_practico: 0,
  requiere_carnet: 1, requiere_licencia: 1, mapeo_confirmado: 1, nacionalidades_canje: null, activo: 1, orden: 1,
} as TipoTramite;
const canje = {
  ...control, id: "CANJE_EXTRANJERA", nombre: "Canje de Licencia Extranjera", requiere_agenda: 0, agenda_id: null,
  nacionalidades_canje: '["Española","Coreana"]', orden: 10,
} as TipoTramite;
const duplicado = { ...canje, id: "DUPLICADO", nombre: "Duplicado", nacionalidades_canje: null } as TipoTramite;

describe("reglas de la especificación", () => {
  it("valida el RUT, acepta K y lo enmascara", () => {
    expect(normalizarRut("12.345.678-5")).toBe("12345678-5");
    expect(normalizarRut("12.345.678-9")).toBeNull();
    expect(formatearRut("12345678-5")).toBe("12.345.678-5");
    expect(enmascararRut("12345678-5")).toBe("12.345.***-5");
    let cuerpo = 10_000_000;
    while (digitoVerificador(String(cuerpo)) !== "K") cuerpo += 1;
    expect(normalizarRut(`${cuerpo}-k`)).toBe(`${cuerpo}-K`);
  });

  it("redirige la renovación anterior a 1984 y el canje de otra nacionalidad", () => {
    const vieja = evaluarTipo({ tipo: control, licenciaObtenidaEl: "1980-01-01" });
    expect(vieja?.codigo).toBe("REDIRIGIR_PRIMERA_VEZ");
    expect(evaluarTipo({ tipo: control, licenciaObtenidaEl: "1990-01-01" })).toBeNull();
    expect(evaluarTipo({ tipo: duplicado })?.codigo).toBe("TRAMITE_SIN_AGENDA");
    expect(evaluarTipo({ tipo: canje, nacionalidad: "Francesa" })?.codigo).toBe("REDIRIGIR_PRIMERA_VEZ");
    expect(evaluarTipo({ tipo: canje, nacionalidad: "Española" })?.codigo).toBe("TRAMITE_SIN_AGENDA");
    expect(evaluarTipo({ tipo: canje, nacionalidad: "coreana" })?.codigo).toBe("TRAMITE_SIN_AGENDA");
  });

  it("arma el horario de lunes a sábado de 08:30 a 14:00 y deja fuera el domingo y el feriado", () => {
    const horas = horasDeBloque("08:30", "14:00", 15);
    expect(horas[0]).toBe("08:30");
    expect(horas.at(-1)).toBe("13:45");
    expect(horas.some((hora) => hora >= "14:00")).toBe(false);
    expect(capacidadExaminador("08:30", "14:00", 1.5)).toBe(8);
    expect(horasDeBloque("08:30", "13:30", 15).at(-1)).toBe("13:15");
    const dias = generarDias({
      desde: "2026-11-23",
      hasta: "2026-11-29",
      plantillas: [1, 2, 3, 4, 5, 6].map((dia) => ({
        agendaId: "GENERAL" as const, diaSemana: dia, horaInicio: "08:30", horaFin: "14:00", duracionMin: 15, cuposPorBloque: 3, cupoDiario: 50,
      })),
      feriados: new Set(["2026-11-27"]),
      bloqueos: new Set(),
    });
    const fechas = dias.map((dia) => dia.fecha);
    expect(fechas).toContain("2026-11-23");
    expect(fechas).toContain("2026-11-28");
    expect(fechas).not.toContain("2026-11-29");
    expect(fechas).not.toContain("2026-11-27");
    expect(diaIsoDeFecha("2026-11-28")).toBe(6);
    expect(domingoDePascua(2026)).toBe("2026-04-05");
  });

  it("carga los 12 nombres exactos del catálogo", () => {
    const sql = readFileSync(new URL("../../migrations/0002_referencia.sql", import.meta.url), "utf8");
    for (const nombre of [
      "Control / Renovación",
      "Control / Renovación (Ley 19.495)",
      "Control / Renovación (Ley 18.290)",
      "Primer Otorgamiento - Clases No Profesionales",
      "Primer Otorgamiento - Clases Profesionales",
      "Primer Otorgamiento - Clases Especiales",
      "Primer Otorgamiento - Clase F",
      "Primer Otorgamiento Clase B 17",
      "Duplicado",
      "Canje de Licencia Extranjera",
      "Regularización de Licencia",
      "Cambio de domicilio y otros datos",
    ]) expect(sql).toContain(`'${nombre}'`);
  });

  it("elimina el EXIF de un JPEG", () => {
    const exif = new TextEncoder().encode("Exif");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, exif.length + 2, ...exif, 0xff, 0xd9]);
    expect(tieneExif(jpeg)).toBe(true);
    const limpio = quitarExif(jpeg);
    expect(tieneExif(limpio)).toBe(false);
    expect(limpio[0]).toBe(0xff);
    expect(limpio[1]).toBe(0xd8);
  });
});
