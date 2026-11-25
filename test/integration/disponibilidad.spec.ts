import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { partesEnZona } from "../../src/domain/tiempo";
import { cuposDesdeAhora } from "../../src/servicios/disponibilidad";
import { entrar, llamar } from "../soporte";

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
});
