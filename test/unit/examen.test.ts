import { describe, expect, it } from "vitest";
import { cantidadDocumentosRequeridos, documentosAPresentar, documentosRequeridos } from "../../src/domain/catalogo";
import { evaluarHabilitacionExamen, otorgamientoAtendido, resultadoDeIntento } from "../../src/domain/examen";
import { resumirDocumentos, comprobanteDisponible } from "../../src/servicios/documentos";

const renovacion = { id: "CONTROL_RENOVACION", requiere_carnet: 1, requiere_licencia: 1 };
const primer = { id: "PRIMER_OTORG_NO_PROF", requiere_carnet: 1, requiere_licencia: 0 };
const examen = { id: "EXAMEN_PRACTICO", requiere_carnet: 0, requiere_licencia: 0 };

describe("documentos según la cita", () => {
  it("pide 4 fotos en una renovación y 2 en el primer otorgamiento de la agenda general", () => {
    expect(documentosRequeridos({ agenda_id: "GENERAL", tipo: renovacion })).toEqual([
      "CARNET_FRENTE", "CARNET_REVERSO", "LICENCIA_FRENTE", "LICENCIA_REVERSO",
    ]);
    expect(cantidadDocumentosRequeridos({ agenda_id: "GENERAL", tipo: primer })).toBe(2);
    expect(documentosRequeridos({ agenda_id: "GENERAL", tipo: primer })).toEqual(["CARNET_FRENTE", "CARNET_REVERSO"]);
    expect(documentosAPresentar({ agenda_id: "GENERAL", tipo: primer })).toEqual(["Cédula de identidad vigente"]);
    expect(documentosAPresentar({ agenda_id: "GENERAL", tipo: renovacion })).toEqual([
      "Cédula de identidad vigente", "Licencia de conducir anterior",
    ]);
  });

  it("no pide documentos en el examen práctico, aunque el tipo venga de un primer otorgamiento antiguo", () => {
    expect(documentosRequeridos({ agenda_id: "PRIMERA_VEZ", tipo: examen })).toEqual([]);
    expect(documentosRequeridos({ agenda_id: "PRIMERA_VEZ", tipo_tramite_id: "PRIMER_OTORG_NO_PROF", requiere_carnet: 1 })).toEqual([]);
    expect(documentosAPresentar({ agenda_id: "PRIMERA_VEZ", tipo: examen })).toEqual([]);
    expect(resumirDocumentos({ agenda_id: "PRIMERA_VEZ", tipo: examen }, ["CARNET_FRENTE"]).faltantes).toEqual([]);
    expect(comprobanteDisponible("AGENDADA", [])).toBe(true);
  });
});

describe("habilitación del examen práctico", () => {
  const otorgamiento = { agenda_id: "GENERAL", tipo_tramite_id: "PRIMER_OTORG_NO_PROF", estado: "ASISTIO", atencion_at: "2026-11-20T15:00:00.000Z" };

  it("habilita solo si el primer otorgamiento de General ya fue atendido", () => {
    expect(otorgamientoAtendido({ ...otorgamiento, atencion_at: null })).toBe(false);
    expect(evaluarHabilitacionExamen({ otorgamientos: [], examenes: [] }).codigo).toBe("NO_HABILITADO");
    expect(evaluarHabilitacionExamen({
      otorgamientos: [{ ...otorgamiento, atencion_at: null }],
      examenes: [],
    }).habilitado).toBe(false);
    expect(evaluarHabilitacionExamen({ otorgamientos: [otorgamiento], examenes: [] }).habilitado).toBe(true);
  });

  it("permite repetir después de un reprobado o de una inasistencia, y bloquea si hay un examen agendado o aprobado", () => {
    expect(evaluarHabilitacionExamen({
      otorgamientos: [otorgamiento],
      examenes: [{ id: "e1", fecha: "2026-11-21", hora: "09:00", estado: "ASISTIO", resultado: "REPROBADO" }],
    }).habilitado).toBe(true);
    expect(resultadoDeIntento({ estado: "NO_ASISTIO", resultado: null })).toBe("NO_ASISTIO");
    expect(evaluarHabilitacionExamen({
      otorgamientos: [otorgamiento],
      examenes: [{ id: "e2", fecha: "2026-11-22", hora: "09:00", estado: "NO_ASISTIO" }],
    }).habilitado).toBe(true);
    const activo = evaluarHabilitacionExamen({
      otorgamientos: [otorgamiento],
      examenes: [{ id: "e3", fecha: "2026-11-25", hora: "10:00", estado: "AGENDADA" }],
    });
    expect(activo.codigo).toBe("EXAMEN_ACTIVO");
    expect(evaluarHabilitacionExamen({
      otorgamientos: [otorgamiento],
      examenes: [{ id: "e4", fecha: "2026-11-23", hora: "09:00", estado: "ASISTIO", resultado: "APROBADO" }],
    }).codigo).toBe("YA_APROBADO");
  });
});
