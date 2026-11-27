import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { digitoVerificador } from "../../src/domain/rut";
import { partesEnZona, sumarDias } from "../../src/domain/tiempo";
import { completarDocumentos, entrar, llamar, subirDocumento } from "../soporte";

function rut(cuerpo: number): string {
  return `${cuerpo}-${digitoVerificador(String(cuerpo))}`;
}

function persona(cuerpo: number) {
  return {
    rut: rut(cuerpo),
    nombres: "Nora",
    apellidos: "Ficticia Examen",
    email: `nora${cuerpo}@ejemplo.cl`,
    telefono: "+56 9 1111 2222",
  };
}

async function fechaLibre(): Promise<string> {
  let fecha = sumarDias(partesEnZona(new Date(), "America/Santiago").fecha, 12);
  for (let i = 0; i < 20; i += 1) {
    const feriado = await env.DB.prepare("SELECT 1 AS n FROM feriados WHERE fecha = ?").bind(fecha).first();
    if (!feriado) return fecha;
    fecha = sumarDias(fecha, 1);
  }
  return fecha;
}

async function abrir(agenda: string, fecha: string, hora: string, bloque = 2, dia = 5) {
  await env.DB.prepare(
    `INSERT INTO cupos_dia (agenda_id, fecha, capacidad, usados, sobrecupo_tope, sobrecupo_usados)
     VALUES (?, ?, ?, 0, 0, 0) ON CONFLICT(agenda_id, fecha) DO UPDATE SET capacidad = excluded.capacidad`,
  ).bind(agenda, fecha, dia).run();
  await env.DB.prepare(
    `INSERT INTO cupos_bloque (agenda_id, fecha, hora, capacidad, usados) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(agenda_id, fecha, hora) DO UPDATE SET capacidad = excluded.capacidad, usados = 0`,
  ).bind(agenda, fecha, hora, bloque).run();
}

async function atender(id: string, sesion: Awaited<ReturnType<typeof entrar>>) {
  expect((await llamar(`/citas/${id}/asistencia`, { method: "POST", sesion, body: { estado: "ASISTIO" } })).status).toBe(200);
  expect((await llamar(`/citas/${id}/atencion`, { method: "POST", sesion })).status).toBe(200);
}

describe("primer otorgamiento y examen práctico", () => {
  it("completa el primer otorgamiento con 2 fotos, habilita el examen y regula las repeticiones", async () => {
    const admin = await entrar("ADMIN");
    const fecha = await fechaLibre();
    const otra = sumarDias(fecha, 1);
    const tercera = sumarDias(fecha, 2);
    const cuarta = sumarDias(fecha, 3);
    await abrir("GENERAL", fecha, "09:00");
    await abrir("PRIMERA_VEZ", fecha, "09:00");
    await abrir("PRIMERA_VEZ", otra, "10:00");
    await abrir("PRIMERA_VEZ", tercera, "10:00");
    await abrir("PRIMERA_VEZ", cuarta, "11:00");

    const datos = persona(27000001);
    const denegada = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "EXAMEN_PRACTICO", fecha, hora: "09:00", canal: "PRESENCIAL", clases: ["B"], ciudadano: datos },
    });
    expect(denegada.status).toBe(422);
    expect(JSON.stringify(denegada.json)).toContain("NO_HABILITADO");

    const otorgamiento = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "PRIMER_OTORG_NO_PROF", fecha, hora: "09:00", canal: "PRESENCIAL", clases: ["B"], ciudadano: datos },
    });
    expect(otorgamiento.status).toBe(201);
    const idOtorga = (otorgamiento.json as { cita: { id: string; agendaId: string } }).cita.id;
    expect((otorgamiento.json as { cita: { agendaId: string } }).cita.agendaId).toBe("GENERAL");

    const ficha = await llamar(`/citas/${idOtorga}`, { sesion: admin });
    const docs = ficha.json as { requeridos: string[]; faltantes: string[]; comprobante: boolean; examen: { habilitado: boolean } };
    expect(docs.requeridos).toEqual(["CARNET_FRENTE", "CARNET_REVERSO"]);
    expect(docs.faltantes).toEqual(["CARNET_FRENTE", "CARNET_REVERSO"]);
    expect(docs.comprobante).toBe(false);
    expect(docs.examen.habilitado).toBe(false);
    expect((await llamar(`/citas/${idOtorga}/comprobante.pdf`, { sesion: admin })).status).toBe(409);

    const licencia = await subirDocumento(idOtorga, "LICENCIA_FRENTE", admin);
    expect(licencia.status).toBe(422);
    expect(await licencia.text()).toContain("DOCUMENTO_NO_APLICA");

    const subidos = await completarDocumentos(idOtorga, admin);
    expect(subidos).toEqual(["CARNET_FRENTE", "CARNET_REVERSO"]);
    expect((await llamar(`/citas/${idOtorga}/comprobante.pdf`, { sesion: admin })).status).toBe(200);
    expect((await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "EXAMEN_PRACTICO", fecha, hora: "09:00", canal: "PRESENCIAL", clases: ["B"], ciudadano: datos },
    })).status).toBe(422);

    await atender(idOtorga, admin);
    const lista = await llamar("/examen/pendientes", { sesion: admin });
    expect(lista.status).toBe(200);
    const pendientes = (lista.json as { pendientes: { rut: string }[] }).pendientes;
    expect(pendientes.some((fila) => fila.rut === datos.rut)).toBe(true);

    const examen = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "EXAMEN_PRACTICO", fecha, hora: "09:00", canal: "PRESENCIAL", clases: ["B"], ciudadano: datos },
    });
    expect(examen.status).toBe(201);
    const idExamen = (examen.json as { cita: { id: string; agendaId: string } }).cita.id;
    expect((examen.json as { cita: { agendaId: string } }).cita.agendaId).toBe("PRIMERA_VEZ");

    const fichaExamen = await llamar(`/citas/${idExamen}`, { sesion: admin });
    const cuerpoExamen = fichaExamen.json as { requeridos: string[]; comprobante: boolean };
    expect(cuerpoExamen.requeridos).toEqual([]);
    expect(cuerpoExamen.comprobante).toBe(true);
    expect((await llamar(`/citas/${idExamen}/comprobante.pdf`, { sesion: admin })).status).toBe(200);
    expect((await subirDocumento(idExamen, "CARNET_FRENTE", admin)).status).toBe(422);
    expect((await subirDocumento(idExamen, "LICENCIA_REVERSO", admin)).status).toBe(422);

    const duplicada = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "EXAMEN_PRACTICO", fecha: otra, hora: "10:00", canal: "PRESENCIAL", clases: ["B"], ciudadano: datos },
    });
    expect(duplicada.status).toBe(422);
    expect(JSON.stringify(duplicada.json)).toContain("EXAMEN_ACTIVO");

    expect((await llamar(`/citas/${idExamen}/resultado`, { method: "POST", sesion: admin, body: { resultado: "REPROBADO" } })).status).toBe(200);
    const repeticion = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "EXAMEN_PRACTICO", fecha: otra, hora: "10:00", canal: "PRESENCIAL", clases: ["B"], ciudadano: datos },
    });
    expect(repeticion.status).toBe(201);
    const idRepeticion = (repeticion.json as { cita: { id: string } }).cita.id;
    expect((await llamar(`/citas/${idRepeticion}/asistencia`, { method: "POST", sesion: admin, body: { estado: "NO_ASISTIO" } })).status).toBe(200);

    const tercero = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "EXAMEN_PRACTICO", fecha: tercera, hora: "10:00", canal: "PRESENCIAL", clases: ["B"], ciudadano: datos },
    });
    expect(tercero.status).toBe(201);
    const idTercero = (tercero.json as { cita: { id: string } }).cita.id;
    expect((await llamar(`/citas/${idTercero}/resultado`, { method: "POST", sesion: admin, body: { resultado: "APROBADO" } })).status).toBe(200);

    const despuesAprobado = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "EXAMEN_PRACTICO", fecha: cuarta, hora: "11:00", canal: "PRESENCIAL", clases: ["B"], ciudadano: datos },
    });
    expect(despuesAprobado.status).toBe(422);
    expect(JSON.stringify(despuesAprobado.json)).toContain("YA_APROBADO");
    const fichaFinal = await llamar(`/citas/${idOtorga}`, { sesion: admin });
    expect((fichaFinal.json as { examen: { intentos: unknown[]; habilitado: boolean } }).examen.intentos).toHaveLength(3);
    expect((fichaFinal.json as { examen: { habilitado: boolean } }).examen.habilitado).toBe(false);
  });
});
