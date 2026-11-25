import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { digitoVerificador } from "../../src/domain/rut";
import { instanteLocal, partesEnZona, sumarDias } from "../../src/domain/tiempo";
import { tareasProgramadas } from "../../src/app";
import { cuposDesdeAhora, libresPorDia } from "../../src/servicios/disponibilidad";
import { completarDocumentos, entrar, llamar } from "../soporte";

const ZONA = "America/Santiago";

async function cupo(agenda: string, fecha: string, hora: string, usados = 0, capacidad = 1): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO cupos_dia (agenda_id, fecha, capacidad, usados, sobrecupo_tope, sobrecupo_usados)
     VALUES (?, ?, 10, 0, 0, 0)
     ON CONFLICT(agenda_id, fecha) DO NOTHING`,
  ).bind(agenda, fecha).run();
  await env.DB.prepare(
    `INSERT INTO cupos_bloque (agenda_id, fecha, hora, capacidad, usados) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(agenda_id, fecha, hora) DO UPDATE SET capacidad = excluded.capacidad, usados = excluded.usados`,
  ).bind(agenda, fecha, hora, capacidad, usados).run();
}

describe("cupos desde ahora en America/Santiago", () => {
  it("excluye las horas de hoy que ya empezaron e incluye las que siguen", async () => {
    await cupo("GENERAL", "2027-03-10", "08:30");
    await cupo("GENERAL", "2027-03-10", "10:45");
    await cupo("GENERAL", "2027-03-10", "11:00");
    await cupo("GENERAL", "2027-03-10", "11:15");
    const ahora = new Date("2027-03-10T14:00:00.000Z");
    expect(partesEnZona(ahora, ZONA)).toMatchObject({ fecha: "2027-03-10", hora: "11:00" });
    const lista = await cuposDesdeAhora(env.DB, "GENERAL", ahora, { limite: 8 });
    expect(lista.map((fila) => `${fila.fecha} ${fila.hora}`)).toEqual(["2027-03-10 11:15"]);
  });

  it("incluye una hora de hoy que todavía no empieza", async () => {
    await cupo("GENERAL", "2027-03-17", "08:30");
    await cupo("GENERAL", "2027-03-17", "09:00");
    const ahora = new Date("2027-03-17T11:00:00.000Z");
    expect(partesEnZona(ahora, ZONA)).toMatchObject({ fecha: "2027-03-17", hora: "08:00" });
    const lista = await cuposDesdeAhora(env.DB, "GENERAL", ahora, { limite: 8 });
    expect(lista.map((fila) => fila.hora)).toEqual(["08:30", "09:00"]);
  });

  it("cerca de medianoche usa el día de Chile y no el de UTC", async () => {
    await cupo("GENERAL", "2026-11-25", "14:45");
    await cupo("GENERAL", "2026-11-26", "08:30");
    const aunChile = new Date("2026-11-26T02:30:00.000Z");
    expect(partesEnZona(aunChile, ZONA)).toMatchObject({ fecha: "2026-11-25", hora: "23:30" });
    expect(aunChile.toISOString().slice(0, 10)).toBe("2026-11-26");
    const lista = await cuposDesdeAhora(env.DB, "GENERAL", aunChile, { limite: 4 });
    expect(lista[0]).toMatchObject({ fecha: "2026-11-26", hora: "08:30" });
    expect(lista.some((fila) => fila.fecha === "2026-11-25")).toBe(false);
  });

  it("omite feriados, bloqueos y cupos llenos", async () => {
    await cupo("GENERAL", "2027-05-04", "09:00", 1, 1);
    await cupo("GENERAL", "2027-05-04", "09:15");
    await env.DB.prepare("INSERT INTO feriados (fecha, nombre) VALUES ('2027-05-05', 'Feriado de prueba')").run();
    await cupo("GENERAL", "2027-05-05", "08:30");
    await env.DB.prepare(
      `INSERT INTO excepciones_dia (id, agenda_id, fecha, tipo, motivo, creado_at)
       VALUES ('bloq-prueba', 'GENERAL', '2027-05-06', 'BLOQUEO', 'Cierre de prueba', '2027-05-01T12:00:00.000Z')`,
    ).run();
    await cupo("GENERAL", "2027-05-06", "08:30");
    await cupo("GENERAL", "2027-05-07", "08:30");
    const lista = await cuposDesdeAhora(env.DB, "GENERAL", new Date("2027-05-04T11:00:00.000Z"), { limite: 8 });
    expect(lista.map((fila) => `${fila.fecha} ${fila.hora}`)).toEqual(["2027-05-04 09:15", "2027-05-07 08:30"]);
  });

  it("el primer hueco coincide con proxima-fecha y con el dashboard", async () => {
    const operador = await entrar("OPERADOR_AGENDA");
    const local = partesEnZona(new Date(), ZONA);
    const hoy = local.fecha;
    const manana = new Date(Date.UTC(
      Number(hoy.slice(0, 4)),
      Number(hoy.slice(5, 7)) - 1,
      Number(hoy.slice(8, 10)) + 1,
    )).toISOString().slice(0, 10);
    await cupo("GENERAL", hoy, "08:30");
    const minutos = local.minutoDelDia + 45;
    const futura = `${String(Math.floor(minutos / 60)).padStart(2, "0")}:${String(minutos % 60).padStart(2, "0")}`;
    if (minutos < 15 * 60) await cupo("GENERAL", hoy, futura);
    await cupo("GENERAL", manana, "08:30");

    const huecos = await llamar("/huecos?agenda=GENERAL", { sesion: operador });
    const proxima = await llamar("/agendas/GENERAL/proxima-fecha", { sesion: operador });
    const tablero = await llamar("/dashboard", { sesion: operador });
    expect(huecos.status).toBe(200);
    expect(proxima.status).toBe(200);
    const primero = (huecos.json as { agendas: { proxima: { fecha: string; hora: string } | null }[] }).agendas[0]?.proxima;
    const fecha = (proxima.json as { proxima: { fecha: string; hora: string } | null }).proxima;
    expect(primero).toEqual(fecha);
    expect(primero && (primero.fecha > hoy || (primero.fecha === hoy && primero.hora > local.hora))).toBe(true);
    const tarjeta = (tablero.json as { agendas: { agenda: string; proximaFecha: { fecha: string; hora: string } | null }[] }).agendas
      .find((fila) => fila.agenda === "GENERAL");
    const [dia, mes, anio] = (tarjeta?.proximaFecha?.fecha ?? "").split("-");
    expect(`${anio}-${mes}-${dia}`).toBe(primero?.fecha);
    expect(tarjeta?.proximaFecha?.hora).toBe(primero?.hora);
  });

  it("no cuenta bloques ya pasados y el calendario usa el mismo próximo cupo", async () => {
    const ahora = new Date("2026-11-25T18:26:00.000Z");
    expect(partesEnZona(ahora, ZONA)).toMatchObject({ fecha: "2026-11-25", hora: "15:26" });
    await cupo("GENERAL", "2026-11-25", "10:00", 0, 3);
    await env.DB.prepare(
      `INSERT INTO cupos_dia (agenda_id, fecha, capacidad, usados, sobrecupo_tope, sobrecupo_usados)
       VALUES ('GENERAL', '2026-11-26', 5, 0, 0, 0)`,
    ).run();
    for (const hora of ["08:30", "08:45", "09:00"]) {
      await env.DB.prepare(
        "INSERT INTO cupos_bloque (agenda_id, fecha, hora, capacidad, usados) VALUES ('GENERAL', '2026-11-26', ?, 3, 0)",
      ).bind(hora).run();
    }
    await cupo("GENERAL", "2026-11-28", "08:30", 0, 3);

    const lista = await cuposDesdeAhora(env.DB, "GENERAL", ahora, { limite: 8 });
    const mes = await libresPorDia(env.DB, ahora, "2026-11");
    const dia26 = mes.find((fila) => fila.agenda === "GENERAL" && fila.fecha === "2026-11-26");
    const dia25 = mes.find((fila) => fila.agenda === "GENERAL" && fila.fecha === "2026-11-25");
    expect(lista[0]).toMatchObject({ fecha: "2026-11-26", hora: "08:30" });
    expect(lista.some((fila) => fila.fecha === "2026-11-25")).toBe(false);
    expect(dia25?.libres ?? 0).toBe(0);
    expect(dia26?.libres).toBe(5);
    expect(mes.filter((fila) => fila.libres > 0).map((fila) => fila.fecha)[0]).toBe(lista[0]?.fecha);
  });

  it("marca como no reservables los bloques de un día ya cerrado", async () => {
    const operador = await entrar("OPERADOR_AGENDA");
    await cupo("GENERAL", "2020-01-06", "09:00", 1, 3);
    const pasado = await llamar("/agendas/GENERAL/dia/2020-01-06", { sesion: operador });
    expect(pasado.status).toBe(200);
    const cuerpo = pasado.json as { libres: number; bloques: { hora: string; reservable: boolean }[] };
    expect(cuerpo.libres).toBe(0);
    expect(cuerpo.bloques.every((bloque) => bloque.reservable === false)).toBe(true);

    await cupo("GENERAL", "2027-03-10", "09:00", 0, 2);
    const futuro = await llamar("/agendas/GENERAL/dia/2027-03-10", { sesion: operador });
    const abierto = futuro.json as { libres: number; bloques: { reservable: boolean }[] };
    expect(abierto.libres).toBe(2);
    expect(abierto.bloques[0]?.reservable).toBe(true);
  });

  it("rechaza reservar y reagendar en un bloque de hoy cuya hora ya pasó", async () => {
    const operador = await entrar("OPERADOR_AGENDA");
    const local = partesEnZona(new Date(), ZONA);
    await env.DB.prepare("UPDATE agendas SET permite_mismo_dia = 1 WHERE id = 'GENERAL'").run();
    await cupo("GENERAL", local.fecha, local.hora, 0, 2);
    const cuerpo = 24000000 + (local.minutoDelDia % 1000);
    const rut = `${cuerpo}-${digitoVerificador(String(cuerpo))}`;
    const rechazada = await llamar("/citas", {
      method: "POST",
      sesion: operador,
      body: {
        tipoTramiteId: "CONTROL_RENOVACION",
        fecha: local.fecha,
        hora: local.hora,
        ciudadano: { rut, nombres: "Nora", apellidos: "Hora Pasada", sinCorreo: true },
      },
    });
    expect(rechazada.status).toBe(409);
    expect((rechazada.json as { codigo?: string }).codigo).toBe("HORA_PASADA");

    const manana = new Date(Date.UTC(
      Number(local.fecha.slice(0, 4)),
      Number(local.fecha.slice(5, 7)) - 1,
      Number(local.fecha.slice(8, 10)) + 1,
    )).toISOString().slice(0, 10);
    await cupo("GENERAL", manana, "10:00", 0, 2);
    const creada = await llamar("/citas", {
      method: "POST",
      sesion: operador,
      body: {
        tipoTramiteId: "CONTROL_RENOVACION",
        fecha: manana,
        hora: "10:00",
        ciudadano: { rut, nombres: "Nora", apellidos: "Hora Pasada", sinCorreo: true },
      },
    });
    expect(creada.status).toBe(201);
    const id = (creada.json as { cita: { id: string } }).cita.id;
    const movida = await llamar(`/citas/${id}/reagendar`, {
      method: "POST",
      sesion: operador,
      body: { fecha: local.fecha, hora: local.hora },
    });
    expect(movida.status).toBe(409);
    expect((movida.json as { codigo?: string }).codigo).toBe("HORA_PASADA");
  });

  it("separa el dashboard y la recepción por rol", async () => {
    const instructor = await entrar("INSTRUCTOR");
    const recepcion = await entrar("RECEPCION");
    const operador = await entrar("OPERADOR_AGENDA");
    const admin = await entrar("ADMIN");
    const local = partesEnZona(new Date(), ZONA);
    await cupo("GENERAL", local.fecha, "09:00", 0, 2);
    const cuerpo = 25000111;
    const rut = `${cuerpo}-${digitoVerificador(String(cuerpo))}`;
    const ciudadano = crypto.randomUUID();
    await env.DB.prepare(
      "INSERT INTO ciudadanos (id, rut, nombres, apellidos, sin_correo, creado_at, actualizado_at) VALUES (?, ?, 'Nora', 'Meson', 1, ?, ?)",
    ).bind(ciudadano, rut, new Date().toISOString(), new Date().toISOString()).run();
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO citas (id, agenda_id, ciudadano_id, tipo_tramite_id, clases, fecha, hora, estado, es_sobrecupo, canal, declara_domicilio_recoleta, docs_requeridos, docs_cargados, creado_por, creado_at)
       VALUES (?, 'GENERAL', ?, 'CONTROL_RENOVACION', '["B"]', ?, '09:00', 'AGENDADA', 0, 'PRESENCIAL', 1, 1, 0, ?, ?)`,
    ).bind(id, ciudadano, local.fecha, operador ? "demo" : "demo", new Date().toISOString()).run();
    expect((await llamar("/huecos?agenda=GENERAL", { sesion: instructor })).status).toBe(403);
    expect((await llamar("/export/estadisticas.csv?agenda=GENERAL", { sesion: instructor })).status).toBe(403);
    const panelInstructor = await llamar("/panel", { sesion: instructor });
    expect(panelInstructor.status).toBe(200);
    expect((panelInstructor.json as { huecos: { agenda: string }[] }).huecos.every((fila) => fila.agenda === "PRIMERA_VEZ")).toBe(true);
    expect((await llamar("/citas", { method: "POST", sesion: recepcion, body: { tipoTramiteId: "CONTROL_RENOVACION", fecha: local.fecha, hora: "09:00" } })).status).toBe(403);
    expect((await llamar("/huecos", { sesion: recepcion })).status).toBe(403);
    expect((await llamar(`/agendas/GENERAL/dia/${local.fecha}`, { sesion: recepcion })).status).toBe(403);
    const lista = await llamar("/lista-dia", { sesion: recepcion });
    expect(lista.status).toBe(200);
    const marcada = await llamar(`/citas/${id}/asistencia`, { method: "POST", sesion: recepcion, body: { estado: "ASISTIO" } });
    expect(marcada.status).toBe(200);
    const manana = new Date(Date.UTC(Number(local.fecha.slice(0, 4)), Number(local.fecha.slice(5, 7)) - 1, Number(local.fecha.slice(8, 10)) + 2)).toISOString().slice(0, 10);
    await cupo("GENERAL", manana, "10:00", 0, 1);
    const futura = await llamar("/citas", {
      method: "POST", sesion: operador,
      body: { tipoTramiteId: "CONTROL_RENOVACION", fecha: manana, hora: "10:00", ciudadano: { rut: `${25000112}-${digitoVerificador("25000112")}`, nombres: "Nora", apellidos: "Manana", sinCorreo: true } },
    });
    expect(futura.status).toBe(201);
    const idFutura = (futura.json as { cita: { id: string } }).cita.id;
    expect((await llamar(`/citas/${idFutura}`, { sesion: recepcion })).status).toBe(403);
    expect((await llamar(`/citas/${idFutura}/asistencia`, { method: "POST", sesion: recepcion, body: { estado: "ASISTIO" } })).status).toBe(403);
    const panelRecepcion = await llamar(`/panel?desde=${local.fecha}&hasta=${local.fecha}`, { sesion: recepcion });
    expect((panelRecepcion.json as { vista: string }).vista).toBe("recepcion");
    expect((panelRecepcion.json as { huecos: unknown[] }).huecos).toEqual([]);
    const creadaCuenta = await llamar("/usuarios", {
      method: "POST", sesion: admin,
      body: { nombre: "Mesa Norte", email: "mesa.norte@ejemplo.cl", rol: "RECEPCION", contrasena: "Clave-Recepcion-2026" },
    });
    expect(creadaCuenta.status).toBe(201);
    const cerrada = await llamar("/config/bloquear-dia", {
      method: "POST", sesion: admin,
      body: { agendaId: "GENERAL", fecha: manana, motivo: "Cierre de prueba" },
    });
    expect(cerrada.status).toBe(200);
    expect((cerrada.json as { citas: { id: string }[] }).citas.some((fila) => fila.id === idFutura)).toBe(true);
  });

  it("cierra solo las horas vencidas, deshace y reubica con comprobante", async () => {
    const recepcion = await entrar("RECEPCION");
    const operador = await entrar("OPERADOR_AGENDA");
    const admin = await entrar("ADMIN");
    const local = partesEnZona(new Date(), ZONA);
    await cupo("GENERAL", local.fecha, "00:00", 0, 1);
    await cupo("GENERAL", local.fecha, "23:59", 0, 1);
    const rutA = `25000221-${digitoVerificador("25000221")}`;
    const rutB = `25000222-${digitoVerificador("25000222")}`;
    async function sembrar(rut: string, nombres: string, hora: string) {
      const ciudadano = crypto.randomUUID();
      const cita = crypto.randomUUID();
      const ahora = new Date().toISOString();
      await env.DB.prepare("INSERT INTO ciudadanos (id, rut, nombres, apellidos, sin_correo, creado_at, actualizado_at) VALUES (?, ?, ?, 'Prueba', 1, ?, ?)").bind(ciudadano, rut, nombres, ahora, ahora).run();
      await env.DB.prepare(
        `INSERT INTO citas (id, agenda_id, ciudadano_id, tipo_tramite_id, clases, fecha, hora, estado, es_sobrecupo, canal, declara_domicilio_recoleta, docs_requeridos, docs_cargados, creado_por, creado_at)
         VALUES (?, 'GENERAL', ?, 'CONTROL_RENOVACION', '["B"]', ?, ?, 'AGENDADA', 0, 'PRESENCIAL', 1, 1, 0, 'demo', ?)`,
      ).bind(cita, ciudadano, local.fecha, hora, ahora).run();
      return cita;
    }
    const pasada = await sembrar(rutA, "Pasada", "00:00");
    const viva = local.hora < "23:59" ? await sembrar(rutB, "Tarde", "23:59") : pasada;
    const cierre = await llamar("/jornada/cerrar", { method: "POST", sesion: recepcion, body: {} });
    expect(cierre.status).toBe(200);
    expect((cierre.json as { marcadas: number }).marcadas).toBeGreaterThan(0);
    const estadoPasada = await env.DB.prepare("SELECT estado FROM citas WHERE id = ?").bind(pasada).first<{ estado: string }>();
    expect(estadoPasada?.estado).toBe("NO_ASISTIO");
    if (viva !== pasada) {
      const estadoViva = await env.DB.prepare("SELECT estado FROM citas WHERE id = ?").bind(viva).first<{ estado: string }>();
      expect(estadoViva?.estado).toBe("AGENDADA");
    }
    await env.DB.prepare("UPDATE cupos_bloque SET usados = capacidad WHERE fecha = ? AND hora IN ('00:00','23:59')").bind(local.fecha).run();
    const deshacer = await llamar(`/citas/${pasada}/asistencia`, { method: "POST", sesion: recepcion, body: { estado: "AGENDADA" } });
    expect(deshacer.status).toBe(200);
    const destino = new Date(Date.UTC(Number(local.fecha.slice(0, 4)), Number(local.fecha.slice(5, 7)) - 1, Number(local.fecha.slice(8, 10)) + 4)).toISOString().slice(0, 10);
    const origen = new Date(Date.UTC(Number(local.fecha.slice(0, 4)), Number(local.fecha.slice(5, 7)) - 1, Number(local.fecha.slice(8, 10)) + 3)).toISOString().slice(0, 10);
    await cupo("GENERAL", destino, "11:15", 0, 1);
    await cupo("GENERAL", origen, "10:00", 0, 1);
    const creada = await llamar("/citas", {
      method: "POST", sesion: operador,
      body: { tipoTramiteId: "CONTROL_RENOVACION", fecha: origen, hora: "10:00", ciudadano: { rut: `25000223-${digitoVerificador("25000223")}`, nombres: "Mueve", apellidos: "Cita", sinCorreo: true } },
    });
    expect(creada.status).toBe(201);
    const idMueve = (creada.json as { cita: { id: string } }).cita.id;
    const antes = await env.DB.prepare("SELECT capacidad, usados FROM cupos_bloque WHERE agenda_id = 'GENERAL' AND fecha = ? AND hora = '10:00'").bind(origen).first<{ capacidad: number; usados: number }>();
    const bloqueo = await llamar("/config/bloquear-dia", { method: "POST", sesion: admin, body: { agendaId: "GENERAL", fecha: origen, motivo: "Corte de agua" } });
    expect(bloqueo.status).toBe(200);
    const propuestas = (bloqueo.json as { propuestas: { citaId: string; fecha: string; hora: string }[] }).propuestas;
    expect(propuestas.some((fila) => fila.citaId === idMueve && fila.fecha === destino)).toBe(true);
    const sigue = await env.DB.prepare("SELECT capacidad, usados FROM cupos_bloque WHERE agenda_id = 'GENERAL' AND fecha = ? AND hora = '10:00'").bind(origen).first<{ capacidad: number; usados: number }>();
    expect(sigue).toEqual(antes);
    const excepcionPrevia = await env.DB.prepare("SELECT COUNT(*) AS n FROM excepciones_dia WHERE agenda_id = 'GENERAL' AND fecha = ?").bind(origen).first<{ n: number }>();
    expect(excepcionPrevia?.n).toBe(0);
    const confirma = await llamar("/config/cierre/confirmar", {
      method: "POST", sesion: admin,
      body: { agendaId: "GENERAL", fecha: origen, motivo: "Corte de agua", movimientos: propuestas.filter((fila) => fila.citaId === idMueve) },
    });
    expect(confirma.status).toBe(200);
    const movida = await env.DB.prepare("SELECT fecha, hora FROM citas WHERE id = ?").bind(idMueve).first<{ fecha: string; hora: string }>();
    expect(movida).toMatchObject({ fecha: destino, hora: "11:15" });
    const cerrado = await env.DB.prepare("SELECT capacidad, usados FROM cupos_bloque WHERE agenda_id = 'GENERAL' AND fecha = ? AND hora = '10:00'").bind(origen).first<{ capacidad: number; usados: number }>();
    expect(cerrado?.capacidad).toBe(cerrado?.usados);
    const excepcion = await env.DB.prepare("SELECT COUNT(*) AS n FROM excepciones_dia WHERE agenda_id = 'GENERAL' AND fecha = ? AND tipo = 'BLOQUEO'").bind(origen).first<{ n: number }>();
    expect(excepcion?.n).toBe(1);
    const sinDocs = await llamar(`/citas/${idMueve}/comprobante.pdf`, { sesion: operador });
    expect(sinDocs.status).toBe(409);
    await completarDocumentos(idMueve, operador);
    const pdf = await llamar(`/citas/${idMueve}/comprobante.pdf`, { sesion: operador });
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toContain("pdf");
    expect(new TextDecoder().decode(pdf.binario).startsWith("%PDF")).toBe(true);
    const diaBloque = new Date(Date.UTC(Number(local.fecha.slice(0, 4)), Number(local.fecha.slice(5, 7)) - 1, Number(local.fecha.slice(8, 10)) + 6)).toISOString().slice(0, 10);
    const diaLibre = new Date(Date.UTC(Number(local.fecha.slice(0, 4)), Number(local.fecha.slice(5, 7)) - 1, Number(local.fecha.slice(8, 10)) + 7)).toISOString().slice(0, 10);
    await cupo("GENERAL", diaBloque, "09:00", 0, 1);
    await cupo("GENERAL", diaLibre, "10:30", 0, 1);
    const bloqueada = await llamar("/citas", {
      method: "POST", sesion: operador,
      body: { tipoTramiteId: "CONTROL_RENOVACION", fecha: diaBloque, hora: "09:00", ciudadano: { rut: `25000224-${digitoVerificador("25000224")}`, nombres: "Bloque", apellidos: "Hora", sinCorreo: true } },
    });
    expect(bloqueada.status).toBe(201);
    const idBloque = (bloqueada.json as { cita: { id: string } }).cita.id;
    const corte = await llamar("/bloques/bloquear", { method: "POST", sesion: admin, body: { agendaId: "GENERAL", fecha: diaBloque, hora: "09:00" } });
    expect(corte.status).toBe(200);
    const delBloque = (corte.json as { propuestas: { citaId: string; fecha: string; hora: string }[] }).propuestas;
    expect(delBloque.some((fila) => fila.citaId === idBloque && fila.fecha === diaLibre && fila.hora === "10:30")).toBe(true);
    const abierto = await env.DB.prepare("SELECT capacidad, usados FROM cupos_bloque WHERE agenda_id = 'GENERAL' AND fecha = ? AND hora = '09:00'").bind(diaBloque).first<{ capacidad: number; usados: number }>();
    expect(abierto).toEqual({ capacidad: 1, usados: 1 });
    await env.DB.prepare("UPDATE cupos_bloque SET usados = capacidad WHERE agenda_id = 'GENERAL' AND fecha = ? AND hora = '10:30'").bind(diaLibre).run();
    const lleno = await llamar("/config/cierre/confirmar", {
      method: "POST", sesion: admin,
      body: { agendaId: "GENERAL", fecha: diaBloque, hora: "09:00", movimientos: delBloque.filter((fila) => fila.citaId === idBloque) },
    });
    expect(lleno.status).toBe(409);
    await env.DB.prepare("UPDATE cupos_bloque SET usados = 0 WHERE agenda_id = 'GENERAL' AND fecha = ? AND hora = '10:30'").bind(diaLibre).run();
    const intacta = await env.DB.prepare("SELECT fecha, hora, estado FROM citas WHERE id = ?").bind(idBloque).first<{ fecha: string; hora: string; estado: string }>();
    expect(intacta).toMatchObject({ fecha: diaBloque, hora: "09:00", estado: "AGENDADA" });
    expect(await env.DB.prepare("SELECT capacidad FROM cupos_bloque WHERE agenda_id = 'GENERAL' AND fecha = ? AND hora = '09:00'").bind(diaBloque).first<{ capacidad: number }>()).toEqual({ capacidad: 1 });
    const hecho = await llamar("/config/cierre/confirmar", {
      method: "POST", sesion: admin,
      body: { agendaId: "GENERAL", fecha: diaBloque, hora: "09:00", movimientos: delBloque.filter((fila) => fila.citaId === idBloque) },
    });
    expect(hecho.status).toBe(200);
    const movidaBloque = await env.DB.prepare("SELECT fecha, hora FROM citas WHERE id = ?").bind(idBloque).first<{ fecha: string; hora: string }>();
    expect(movidaBloque).toMatchObject({ fecha: diaLibre, hora: "10:30" });
  });

  it("cierra solo después de la gracia y cualquier día pasado abierto", async () => {
    const hoy = "2026-11-25";
    const ayer = sumarDias(hoy, -1);
    const manana = sumarDias(hoy, 1);
    async function agendada(fecha: string, hora: string) {
      const ciudadano = crypto.randomUUID();
      const cita = crypto.randomUUID();
      const ahora = new Date().toISOString();
      await env.DB.prepare("INSERT INTO ciudadanos (id, rut, nombres, apellidos, sin_correo, creado_at, actualizado_at) VALUES (?, ?, 'Nora', 'Prueba', 1, ?, ?)").bind(ciudadano, `${ciudadano.slice(0, 8)}`, ahora, ahora).run();
      await env.DB.prepare(
        `INSERT INTO citas (id, agenda_id, ciudadano_id, tipo_tramite_id, clases, fecha, hora, estado, es_sobrecupo, canal, declara_domicilio_recoleta, docs_requeridos, docs_cargados, creado_por, creado_at)
         VALUES (?, 'GENERAL', ?, 'CONTROL_RENOVACION', '["B"]', ?, ?, 'AGENDADA', 0, 'PRESENCIAL', 1, 1, 0, 'demo', ?)`,
      ).bind(cita, ciudadano, fecha, hora, ahora).run();
      return cita;
    }
    const pasada = await agendada(ayer, "09:00");
    const vigente = await agendada(hoy, "09:00");
    const futura = await agendada(manana, "09:00");
    await tareasProgramadas(env, instanteLocal(hoy, "14:20", ZONA));
    const trasGraciaCorta = await env.DB.prepare("SELECT id, estado FROM citas WHERE id IN (?, ?, ?)").bind(pasada, vigente, futura).all<{ id: string; estado: string }>();
    const mapa = Object.fromEntries(trasGraciaCorta.results.map((fila) => [fila.id, fila.estado]));
    expect(mapa[pasada]).toBe("NO_ASISTIO");
    expect(mapa[vigente]).toBe("AGENDADA");
    expect(mapa[futura]).toBe("AGENDADA");
    await tareasProgramadas(env, instanteLocal(hoy, "14:30", ZONA));
    const despues = await env.DB.prepare("SELECT id, estado FROM citas WHERE id IN (?, ?)").bind(vigente, futura).all<{ id: string; estado: string }>();
    const final = Object.fromEntries(despues.results.map((fila) => [fila.id, fila.estado]));
    expect(final[vigente]).toBe("NO_ASISTIO");
    expect(final[futura]).toBe("AGENDADA");
  });

  it("administración lista y guarda feriados", async () => {
    const admin = await entrar("ADMIN");
    const lista = await llamar("/feriados", { sesion: admin });
    expect(lista.status).toBe(200);
    const alta = await llamar("/feriados", { method: "POST", sesion: admin, body: { fecha: "2026-12-25", nombre: "Navidad" } });
    expect(alta.status).toBe(200);
    const otra = await llamar("/feriados", { sesion: admin });
    expect((otra.json as { feriados: { fecha: string; nombre: string }[] }).feriados.some((fila) => fila.fecha === "2026-12-25" && fila.nombre === "Navidad")).toBe(true);
    const ajena = await entrar("OPERADOR_AGENDA");
    expect((await llamar("/feriados", { sesion: ajena })).status).toBe(403);
  });
});
