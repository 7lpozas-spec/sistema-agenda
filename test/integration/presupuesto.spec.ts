import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { tareasProgramadas } from "../../src/app";
import { publicarCuposLote } from "../../src/servicios/generar";
import { entrar, llamar } from "../soporte";

const TOPE = 40;

function contar(db: D1Database): { n: number; restaurar: () => void } {
  const conteo = { n: 0 };
  const preparar = db.prepare.bind(db);
  const lote = db.batch.bind(db);
  const envolver = (stmt: D1PreparedStatement): D1PreparedStatement => {
    const marcado = stmt as D1PreparedStatement & { __contado?: boolean };
    if (marcado.__contado) return stmt;
    const correr = stmt.run.bind(stmt);
    const todos = stmt.all.bind(stmt);
    const uno = stmt.first.bind(stmt);
    const ligar = stmt.bind.bind(stmt);
    stmt.run = ((...args: unknown[]) => {
      conteo.n += 1;
      return correr(...args);
    }) as D1PreparedStatement["run"];
    stmt.all = ((...args: unknown[]) => {
      conteo.n += 1;
      return todos(...args);
    }) as D1PreparedStatement["all"];
    stmt.first = ((...args: unknown[]) => {
      conteo.n += 1;
      return uno(...args);
    }) as D1PreparedStatement["first"];
    stmt.bind = ((...args: unknown[]) => envolver(ligar(...args))) as D1PreparedStatement["bind"];
    marcado.__contado = true;
    return stmt;
  };
  db.prepare = ((sql: string) => envolver(preparar(sql))) as D1Database["prepare"];
  db.batch = (async (stmts: D1PreparedStatement[]) => {
    conteo.n += 1;
    return lote(stmts);
  }) as D1Database["batch"];
  return {
    n: 0,
    restaurar: () => {
      db.prepare = preparar as D1Database["prepare"];
      db.batch = lote;
    },
    get consultas() {
      return conteo.n;
    },
  } as { n: number; restaurar: () => void; consultas: number };
}

async function medir(trabajo: () => Promise<unknown>): Promise<number> {
  const medidor = contar(env.DB);
  const antes = medidor.consultas;
  try {
    await trabajo();
  } finally {
    medidor.restaurar();
  }
  return medidor.consultas - antes;
}

describe("presupuesto de consultas D1", () => {
  it("ninguna ruta, el cron ni un lote de cupos pasa de 40 consultas", async () => {
    const salud = await medir(() => llamar("/salud"));
    expect(salud).toBeLessThanOrEqual(2);

    const admin = await entrar("ADMIN");
    const operador = await entrar("OPERADOR_AGENDA");
    const hoy = "2026-11-25";
    const rutas: [string, Parameters<typeof llamar>[1] | undefined][] = [
      ["/me", { sesion: operador }],
      ["/dashboard", { sesion: operador }],
      ["/estadisticas?desde=2026-11-01&hasta=2026-11-25", { sesion: operador }],
      ["/huecos?desde=2026-11-25", { sesion: operador }],
      ["/disponibilidad/mes?mes=2026-11", { sesion: operador }],
      [`/lista-dia?fecha=${hoy}`, { sesion: operador }],
      [`/agendas/GENERAL/dia/${hoy}`, { sesion: operador }],
      ["/config/cupos/generar", { method: "POST", sesion: admin, body: {} }],
      ["/import/citas?desde=1", {
        method: "POST",
        sesion: admin,
        cuerpoTexto: ["rut;nombres;apellidos;email;tipo;fecha;hora", ...Array.from({ length: 8 }, (_, i) =>
          `3000001${i}-K;Nora;Ficticia;nora${i}@ejemplo.cl;CONTROL_RENOVACION;2026-12-20;09:00`)].join("\n"),
      }],
    ];
    for (const [ruta, opciones] of rutas) {
      const consultas = await medir(() => llamar(ruta, opciones));
      expect(consultas, ruta).toBeLessThanOrEqual(TOPE);
      expect(consultas, ruta).toBeGreaterThan(0);
    }
    const cron = await medir(() => tareasProgramadas(env, new Date("2026-11-25T18:30:00Z")));
    expect(cron).toBeLessThanOrEqual(TOPE);
    const lote = await medir(() => publicarCuposLote(env.DB, new Date("2026-11-25T18:30:00Z")));
    expect(lote).toBeLessThanOrEqual(TOPE);
  });

  it("la regeneración no reescribe cupos sin cambios", async () => {
    const ahora = new Date("2026-11-25T18:30:00Z");
    for (let vuelta = 0; vuelta < 200; vuelta += 1) {
      const lote = await publicarCuposLote(env.DB, ahora);
      if (!lote.pendiente) break;
    }
    const lotes = { n: 0 };
    const original = env.DB.batch.bind(env.DB);
    env.DB.batch = (async (stmts: D1PreparedStatement[]) => {
      lotes.n += 1;
      return original(stmts);
    }) as D1Database["batch"];
    try {
      const otra = await publicarCuposLote(env.DB, ahora);
      expect(otra).toEqual({ escritos: 0, pendiente: false });
    } finally {
      env.DB.batch = original;
    }
    expect(lotes.n).toBe(0);
  });
});
