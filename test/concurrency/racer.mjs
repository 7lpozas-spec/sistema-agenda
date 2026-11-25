import { parentPort, workerData } from "node:worker_threads";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync(workerData.file);
db.exec("PRAGMA busy_timeout = 8000");
try {
  db.exec("BEGIN IMMEDIATE");
  const bloque = db.prepare(workerData.sqlBloque).run("GENERAL", "2026-12-02", "10:00");
  if (bloque.changes !== 1) {
    db.exec("ROLLBACK");
    parentPort.postMessage({ ok: false, reason: "sin_bloque" });
  } else {
    const dia = db.prepare(workerData.sqlDia).run("GENERAL", "2026-12-02");
    if (dia.changes !== 1) {
      db.exec("ROLLBACK");
      parentPort.postMessage({ ok: false, reason: "sin_dia" });
    } else {
      db.prepare("INSERT INTO citas (id, ciudadano) VALUES (?, ?)").run(workerData.id, workerData.person);
      db.exec("COMMIT");
      parentPort.postMessage({ ok: true });
    }
  }
} catch (error) {
  try { db.exec("ROLLBACK"); } catch { /* ya cerrada */ }
  parentPort.postMessage({ ok: false, reason: error instanceof Error ? error.message : "error" });
}
