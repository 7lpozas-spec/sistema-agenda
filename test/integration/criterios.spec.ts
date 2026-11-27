import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { digitoVerificador } from "../../src/domain/rut";
import { partesEnZona, sumarDias, instanteLocal } from "../../src/domain/tiempo";
import { tareasProgramadas } from "../../src/app";
import { completarDocumentos, entrar, llamar, subirDocumento } from "../soporte";

function rut(cuerpo: number): string {
  return `${cuerpo}-${digitoVerificador(String(cuerpo))}`;
}
function codigo(respuesta: { json: unknown }): string {
  return (respuesta.json as { codigo?: string }).codigo ?? "";
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

async function abrir(agenda: string, fecha: string, hora: string, bloque = 1, dia = 1) {
  await env.DB.prepare(
    `INSERT INTO cupos_dia (agenda_id, fecha, capacidad, usados, sobrecupo_tope, sobrecupo_usados)
     VALUES (?, ?, ?, 0, 0, 0) ON CONFLICT(agenda_id, fecha) DO UPDATE SET capacidad = excluded.capacidad`,
  ).bind(agenda, fecha, dia).run();
  await env.DB.prepare(
    `INSERT INTO cupos_bloque (agenda_id, fecha, hora, capacidad, usados) VALUES (?, ?, ?, ?, 0)
     ON CONFLICT(agenda_id, fecha, hora) DO UPDATE SET capacidad = excluded.capacidad, usados = 0`,
  ).bind(agenda, fecha, hora, bloque).run();
}

function persona(cuerpo: number, extra: Record<string, unknown> = {}) {
  return {
    rut: rut(cuerpo),
    nombres: "Nora",
    apellidos: "Ficticia Ejemplo",
    email: `nora${cuerpo}@ejemplo.cl`,
    telefono: "+56 9 1111 2222",
    ...extra,
  };
}

describe("criterios de aceptación", () => {
  it("1 y 15. El último cupo admite una sola de 50 reservas y el instructor no agenda", async () => {
    const general = await entrar("OPERADOR_AGENDA");
    const primera = await entrar("INSTRUCTOR");
    const fecha = await fechaLibre();
    await abrir("GENERAL", fecha, "10:00", 1, 1);
    await abrir("PRIMERA_VEZ", fecha, "10:00", 1, 1);
    const cruzada = await llamar("/citas", {
      method: "POST", sesion: primera,
      body: { tipoTramiteId: "PRIMER_OTORG_NO_PROF", fecha, hora: "10:00", canal: "TELEFONO", clases: ["B"], ciudadano: persona(25000001) },
    });
    expect(cruzada.status).toBe(403);
    const respuestas = await Promise.all(Array.from({ length: 50 }, (_, i) => llamar("/citas", {
      method: "POST",
      sesion: general,
      body: {
        tipoTramiteId: "CONTROL_RENOVACION", fecha, hora: "10:00", canal: "TELEFONO", clases: ["B"],
        ciudadano: persona(26000000 + i),
        Idempotency: undefined,
      },
    })));
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    const dia = await env.DB.prepare("SELECT usados, capacidad FROM cupos_dia WHERE agenda_id = 'GENERAL' AND fecha = ?").bind(fecha).first<{ usados: number; capacidad: number }>();
    const citas = await env.DB.prepare("SELECT COUNT(*) AS n FROM citas WHERE agenda_id = 'GENERAL' AND fecha = ? AND hora = '10:00' AND estado = 'AGENDADA'").bind(fecha).first<{ n: number }>();
    expect(dia?.usados).toBe(1);
    expect(dia?.usados).toBeLessThanOrEqual(dia?.capacidad ?? 0);
    expect(citas?.n).toBe(1);
    const duplicado = await llamar("/citas", {
      method: "POST", sesion: general,
      body: { tipoTramiteId: "DUPLICADO", fecha, hora: "10:00", canal: "PRESENCIAL", ciudadano: persona(25000002) },
    });
    expect(duplicado.status).toBe(422);
    expect(codigo(duplicado)).toBe("TRAMITE_SIN_AGENDA");
    expect(primera.email).toContain("@");
  });

  it("2, 3, 9 y 16. Permisos, RUT, operador y licencia anterior a 1984", async () => {
    const general = await entrar("OPERADOR_AGENDA");
    const operador = await entrar("INSTRUCTOR");
    const fecha = await fechaLibre();
    await abrir("GENERAL", fecha, "11:00", 3, 10);
    const tableroInstructor = await llamar("/dashboard", { sesion: operador });
    expect(tableroInstructor.status).toBe(200);
    expect((tableroInstructor.json as { agendas: { agenda: string }[] }).agendas.every((fila) => fila.agenda !== "GENERAL")).toBe(true);
    expect((await llamar("/estadisticas?agenda=GENERAL", { sesion: operador })).status).toBe(403);
    expect((await llamar("/huecos?agenda=GENERAL", { sesion: operador })).status).toBe(403);
    expect((await llamar("/citas", { method: "POST", sesion: operador, body: { tipoTramiteId: "CONTROL_RENOVACION" } })).status).toBe(403);
    expect((await llamar("/agendas/GENERAL/proxima-fecha", { sesion: operador })).status).toBe(403);
    const lista = await llamar("/lista-dia", { sesion: operador });
    expect(lista.status).toBe(200);
    const mala = await llamar("/citas", {
      method: "POST", sesion: general,
      body: { tipoTramiteId: "CONTROL_RENOVACION", fecha, hora: "11:00", canal: "PRESENCIAL", ciudadano: { ...persona(25000003), rut: "12.345.678-9" } },
    });
    expect(mala.status).toBe(400);
    expect(codigo(mala)).toBe("RUT_INVALIDO");
    const vieja = await llamar("/citas", {
      method: "POST", sesion: general,
      body: { tipoTramiteId: "CONTROL_RENOVACION", fecha, hora: "11:00", canal: "PRESENCIAL", licenciaObtenidaEl: "1980-05-01", ciudadano: persona(25000004) },
    });
    expect(vieja.status).toBe(422);
    expect(codigo(vieja)).toBe("REDIRIGIR_PRIMERA_VEZ");
    const buena = await llamar("/citas", {
      method: "POST", sesion: general,
      body: { tipoTramiteId: "CONTROL_RENOVACION", fecha, hora: "11:00", canal: "CORREO", licenciaObtenidaEl: "2001-01-01", ciudadano: persona(25000005) },
    });
    expect(buena.status).toBe(201);
    const id = (buena.json as { cita: { id: string } }).cita.id;
    expect((await llamar(`/citas/${id}/asistencia`, { method: "POST", sesion: operador, body: { estado: "ASISTIO" } })).status).toBe(403);
    const asistencia = await llamar(`/citas/${id}/asistencia`, { method: "POST", sesion: general, body: { estado: "ASISTIO" } });
    expect(asistencia.status).toBe(200);
    const aud = await env.DB.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE entidad_id = ?").bind(id).first<{ n: number }>();
    expect((aud?.n ?? 0) > 0).toBe(true);
  });

  it("4, 12, 13, 17, 18 y 19. Dashboard, catálogo, canje y exportación", async () => {
    const admin = await entrar("ADMIN");
    const tipos = await llamar("/tipos-tramite", { sesion: admin });
    expect((tipos.json as { tipos: { nombre: string }[] }).tipos).toHaveLength(13);
    expect((tipos.json as { tipos: { nombre: string }[] }).tipos.map((t) => t.nombre)).toContain("Primer Otorgamiento Clase B 17");
    expect((tipos.json as { tipos: { nombre: string }[] }).tipos.map((t) => t.nombre)).toContain("Examen práctico");
    const editado = await llamar("/config/tipos-tramite/DUPLICADO", { method: "PATCH", sesion: admin, body: { nombre: "Duplicado" } });
    expect(editado.status).toBe(200);
    const francesa = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "CANJE_EXTRANJERA", nacionalidad: "Francesa", canal: "PRESENCIAL", ciudadano: persona(25000006) },
    });
    expect(codigo(francesa)).toBe("REDIRIGIR_PRIMERA_VEZ");
    const espanola = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "CANJE_EXTRANJERA", nacionalidad: "Española", canal: "PRESENCIAL", ciudadano: persona(25000007) },
    });
    expect(codigo(espanola)).toBe("TRAMITE_SIN_AGENDA");
    const tablero = await llamar("/dashboard", { sesion: admin });
    expect(tablero.status).toBe(200);
    const cuerpo = tablero.json as { agendas: { agenda: string; proximaFecha: { fecha: string } | null; cuposLibresMes: number }[]; porTipo: unknown[] };
    expect(cuerpo.agendas.length).toBeGreaterThan(0);
    expect(cuerpo.porTipo).toBeTruthy();
    const sql = await env.DB.prepare("SELECT COALESCE(SUM(capacidad - usados), 0) AS n FROM cupos_dia WHERE agenda_id = 'GENERAL' AND fecha >= ? AND fecha < ?")
      .bind(`${partesEnZona(new Date(), "America/Santiago").fecha.slice(0, 7)}-01`, "2099-01-01").first<{ n: number }>();
    const general = cuerpo.agendas.find((agenda) => agenda.agenda === "GENERAL");
    expect(general?.cuposLibresMes).toBe(sql?.n ?? 0);
    const csv = await llamar("/export/citas.csv?desde=2000-01-01&hasta=2099-01-01", { sesion: admin });
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    const { regenerarCupos } = await import("../../src/servicios/generar");
    await regenerarCupos(env.DB);
    const domingo = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM cupos_bloque WHERE fecha IN (SELECT fecha FROM cupos_dia) AND hora >= '14:00'",
    ).first<{ n: number }>();
    expect(domingo?.n).toBe(0);
    const sabado = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM cupos_dia WHERE agenda_id = 'GENERAL'",
    ).first<{ n: number }>();
    expect((sabado?.n ?? 0) > 0).toBe(true);
  });

  it("5, 6, 7, 8 y 11. Captura, recordatorio, ausencia y auditoría de lectura", async () => {
    const admin = await entrar("ADMIN");
    const fecha = await fechaLibre();
    await abrir("GENERAL", fecha, "09:00", 2, 5);
    const creada = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "CONTROL_RENOVACION", fecha, hora: "09:00", canal: "PRESENCIAL", ciudadano: persona(25000008) },
    });
    const id = (creada.json as { cita: { id: string } }).cita.id;
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0xff, 0xd9]);
    const subida = await exports.default.fetch(`https://licencias.test/api/citas/${id}/foto?tipo=CEDULA`, {
      method: "POST",
      headers: {
        origin: "https://licencias.test",
        "content-type": "image/jpeg",
        cookie: admin.cookie,
        "x-csrf-token": admin.csrf,
      },
      body: new Blob([jpeg], { type: "image/jpeg" }),
    });
    if (subida.status !== 201) throw new Error(await subida.text());
    const doc = await subida.json() as { documento: { id: string; ruta: string; bytes: number } };
    expect(doc.documento.ruta.startsWith(`${fecha}/`)).toBe(true);
    expect(doc.documento.bytes).toBeLessThanOrEqual(500 * 1024);
    const guardado = await env.FOTOS.get(doc.documento.ruta);
    const bytes = new Uint8Array(await guardado!.arrayBuffer());
    expect(new TextDecoder().decode(bytes)).not.toContain("Exif");
    const lectura = await llamar(`/documentos/${doc.documento.id}/contenido`, { sesion: admin });
    expect(lectura.status).toBe(200);
    const lecturaAudit = await env.DB.prepare("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'leer_documento' AND entidad_id = ?").bind(doc.documento.id).first<{ n: number }>();
    expect(lecturaAudit?.n).toBe(1);

    const pendiente = await llamar(`/citas/${id}`, { sesion: admin });
    expect((pendiente.json as { faltantes: string[] }).faltantes).toEqual(["CARNET_FRENTE", "CARNET_REVERSO", "LICENCIA_FRENTE", "LICENCIA_REVERSO"]);
    const bloqueado = await llamar(`/citas/${id}/comprobante.pdf`, { sesion: admin });
    expect(bloqueado.status).toBe(409);
    expect(JSON.stringify(bloqueado.json)).toContain("DOCUMENTOS_PENDIENTES");
    const recepcion = await entrar("RECEPCION");
    const otroDia = await subirDocumento(id, "CARNET_FRENTE", recepcion);
    expect(otroDia.status).toBe(403);
    expect(await subirDocumento(id, "CARNET_FRENTE", admin)).toHaveProperty("status", 201);
    expect(await subirDocumento(id, "CARNET_FRENTE", admin)).toHaveProperty("status", 201);
    const parcial = await env.DB.prepare("SELECT docs_cargados FROM citas WHERE id = ?").bind(id).first<{ docs_cargados: number }>();
    expect(parcial?.docs_cargados).toBe(1);
    await completarDocumentos(id, admin);
    const completa = await llamar(`/citas/${id}`, { sesion: admin });
    expect(completa.json).toMatchObject({ faltantes: [], comprobante: true });
    const cargados = await env.DB.prepare("SELECT docs_cargados FROM citas WHERE id = ?").bind(id).first<{ docs_cargados: number }>();
    expect(cargados?.docs_cargados).toBe(4);
    const vigentes = await env.DB.prepare("SELECT COUNT(*) AS n FROM documentos WHERE cita_id = ? AND tipo = 'CARNET_FRENTE' AND vigente = 1").bind(id).first<{ n: number }>();
    expect(vigentes?.n).toBe(1);
    expect((await llamar(`/citas/${id}/comprobante.pdf`, { sesion: admin })).status).toBe(200);

    const manana = sumarDias(partesEnZona(new Date(), "America/Santiago").fecha, 1);
    await abrir("GENERAL", manana, "08:30", 2, 5);
    const recordada = await llamar("/citas", {
      method: "POST", sesion: admin,
      body: { tipoTramiteId: "CONTROL_RENOVACION", fecha: manana, hora: "08:30", canal: "TELEFONO", ciudadano: persona(25000009) },
    });
    const citaRecordada = (recordada.json as { cita: { id: string } }).cita.id;
    const hoy = partesEnZona(new Date(), "America/Santiago").fecha;
    await tareasProgramadas(env, instanteLocal(hoy, "10:00", "America/Santiago"));
    await tareasProgramadas(env, instanteLocal(hoy, "10:00", "America/Santiago"));
    const correos = await env.DB.prepare("SELECT COUNT(*) AS n FROM correos_log WHERE cita_id = ? AND tipo = 'RECORDATORIO'").bind(citaRecordada).first<{ n: number }>();
    // Sin proveedor configurado, cada intento queda como error y puede reintentarse.
    expect(correos?.n).toBe(2);
    const fallidos = await env.DB.prepare("SELECT COUNT(*) AS n FROM correos_log WHERE cita_id = ? AND tipo = 'RECORDATORIO' AND estado = 'ERROR'").bind(citaRecordada).first<{ n: number }>();
    expect(fallidos?.n).toBe(2);
    const marca = await env.DB.prepare("SELECT recordatorio_enviado_at FROM citas WHERE id = ?").bind(citaRecordada).first<{ recordatorio_enviado_at: string | null }>();
    expect(marca?.recordatorio_enviado_at).toBeNull();
    await env.DB.prepare("UPDATE citas SET estado = 'CANCELADA' WHERE id = ?").bind(citaRecordada).run();
    await env.DB.prepare("UPDATE citas SET recordatorio_enviado_at = NULL WHERE id = ?").bind(citaRecordada).run();
    await tareasProgramadas(env, instanteLocal(hoy, "10:00", "America/Santiago"));
    const despues = await env.DB.prepare("SELECT COUNT(*) AS n FROM correos_log WHERE cita_id = ? AND tipo = 'RECORDATORIO'").bind(citaRecordada).first<{ n: number }>();
    expect(despues?.n).toBe(2);

    await abrir("GENERAL", fecha, "08:30", 2, 4);
    await abrir("PRIMERA_VEZ", fecha, "08:30", 2, 4);
    const pv = await entrar("OPERADOR_AGENDA");
    const otorga = await llamar("/citas", {
      method: "POST", sesion: pv,
      body: { tipoTramiteId: "PRIMER_OTORG_NO_PROF", fecha, hora: "08:30", canal: "PRESENCIAL", clases: ["B"], ciudadano: persona(25000010) },
    });
    expect(otorga.status).toBe(201);
    const idOtorga = (otorga.json as { cita: { id: string } }).cita.id;
    expect((await llamar(`/citas/${idOtorga}/asistencia`, { method: "POST", sesion: admin, body: { estado: "ASISTIO" } })).status).toBe(200);
    expect((await llamar(`/citas/${idOtorga}/atencion`, { method: "POST", sesion: admin })).status).toBe(200);
    const citaPv = await llamar("/citas", {
      method: "POST", sesion: pv,
      body: { tipoTramiteId: "EXAMEN_PRACTICO", fecha, hora: "08:30", canal: "PRESENCIAL", clases: ["B"], ciudadano: persona(25000010) },
    });
    expect(citaPv.status).toBe(201);
    const ausencia = await llamar("/config/examinadores/ausencia", { method: "POST", sesion: admin, body: { fecha, motivo: "Licencia médica de prueba" } });
    expect(ausencia.status).toBe(200);
    expect((ausencia.json as { citas: unknown[] }).citas.length).toBeGreaterThan(0);
    const otra = await fechaLibre();
    await abrir("PRIMERA_VEZ", otra, "09:00", 1, 2);
    const bloque = await llamar("/config/reagendar-bloque", {
      method: "POST", sesion: admin,
      body: { movimientos: [{ citaId: (citaPv.json as { cita: { id: string } }).cita.id, fecha: otra, hora: "09:00" }] },
    });
    expect((bloque.json as { reagendadas: number }).reagendadas).toBe(1);
  });

  it("importa filas válidas y exporta estadísticas en csv, xlsx y pdf", async () => {
    const admin = await entrar("ADMIN");
    const fecha = await fechaLibre();
    await abrir("GENERAL", fecha, "11:00", 2, 5);
    const rutPersona = rut(26000011);
    const csv = [
      "rut;nombres;apellidos;email;tipo;fecha;hora;canal",
      `${rutPersona};Nilda;Importada;nilda.importada@ejemplo.cl;CONTROL_RENOVACION;${fecha};11:00;PRESENCIAL`,
      `no-es-rut;Ana;Mala;ana@ejemplo.cl;CONTROL_RENOVACION;${fecha};11:15;PRESENCIAL`,
    ].join("\n");
    const importado = await llamar("/import/citas", { method: "POST", sesion: admin, cuerpoTexto: csv });
    expect(importado.status).toBe(200);
    const resultado = importado.json as { insertadas: number; errores: { linea: number }[] };
    expect(resultado.insertadas).toBe(1);
    expect(resultado.errores.length).toBe(1);
    const guardada = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id WHERE ci.rut = ?",
    ).bind(`${26000011}-${digitoVerificador("26000011")}`).first<{ n: number }>();
    expect(guardada?.n).toBe(1);
    const stats = await llamar(`/estadisticas?desde=${fecha}&hasta=${fecha}`, { sesion: admin });
    expect(stats.status).toBe(200);
    expect((stats.json as { kpis: { periodo: number } }).kpis.periodo).toBeGreaterThan(0);
    const xlsx = await llamar(`/export/estadisticas.xlsx?desde=${fecha}&hasta=${fecha}`, { sesion: admin });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers.get("content-type")).toContain("spreadsheet");
    const bytes = new Uint8Array(xlsx.binario);
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const pdf = await llamar(`/export/reporte-diario.pdf?fecha=${fecha}`, { sesion: admin });
    expect(pdf.headers.get("content-type")).toContain("pdf");
    expect(new TextDecoder().decode(pdf.binario).startsWith("%PDF")).toBe(true);
    const horario = await llamar("/config/horarios", { sesion: admin });
    const filas = (horario.json as { horarios: { dia_semana: number; hora_fin: string }[] }).horarios;
    expect(filas.length).toBeGreaterThan(0);
    expect(filas.every((fila) => fila.hora_fin === "14:00" && fila.dia_semana >= 1 && fila.dia_semana <= 6)).toBe(true);
    expect(filas.some((fila) => fila.dia_semana === 6)).toBe(true);
  });
});
