import { DatabaseSync } from "node:sqlite";
import { Worker } from "node:worker_threads";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SQL_TOMAR_BLOQUE } from "../../src/data/sql";

describe("concurrencia del último cupo", () => {
  it("deja ganar a exactamente una de 50 reservas simultáneas", async () => {
    const directorio = mkdtempSync(join(tmpdir(), "cupos-"));
    const archivo = join(directorio, "cupos.sqlite");
    const db = new DatabaseSync(archivo);
    db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE cupos_bloque (
        agenda_id TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL,
        capacidad INTEGER NOT NULL, usados INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (agenda_id, fecha, hora),
        CHECK (usados <= capacidad)
      );
      CREATE TABLE cupos_dia (
        agenda_id TEXT NOT NULL, fecha TEXT NOT NULL,
        capacidad INTEGER NOT NULL, usados INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (agenda_id, fecha),
        CHECK (usados <= capacidad)
      );
      CREATE TABLE citas (id TEXT PRIMARY KEY, ciudadano TEXT NOT NULL UNIQUE);
      INSERT INTO cupos_bloque VALUES ('GENERAL', '2026-12-02', '10:00', 1, 0);
      INSERT INTO cupos_dia VALUES ('GENERAL', '2026-12-02', 1, 0);
    `);
    db.close();
    const trabajadores = await Promise.all(
      Array.from({ length: 50 }, (_, indice) => new Promise<{ ok: boolean }>((resolve, reject) => {
        const worker = new Worker(new URL("../concurrency/racer.mjs", import.meta.url), {
          workerData: {
            file: archivo,
            sqlBloque: SQL_TOMAR_BLOQUE,
            sqlDia: "UPDATE cupos_dia SET usados = usados + 1 WHERE agenda_id = ? AND fecha = ? AND usados < capacidad",
            id: `cita-${indice}`,
            person: `persona-${indice}`,
          },
        });
        worker.on("message", resolve);
        worker.on("error", reject);
      })),
    );
    const revision = new DatabaseSync(archivo);
    revision.exec("PRAGMA busy_timeout = 5000");
    const bloque = revision.prepare("SELECT usados, capacidad FROM cupos_bloque").get() as { usados: number; capacidad: number };
    const citas = revision.prepare("SELECT COUNT(*) AS n FROM citas").get() as { n: number };
    revision.close();
    rmSync(directorio, { recursive: true, force: true });
    expect(trabajadores.filter((item) => item.ok)).toHaveLength(1);
    expect(bloque.usados).toBe(1);
    expect(bloque.usados).toBeLessThanOrEqual(bloque.capacidad);
    expect(citas.n).toBe(1);
  });
});
