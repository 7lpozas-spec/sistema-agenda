import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeEach } from "vitest";

function dividirSql(sql: string): string[] {
  const sinComentarios = sql
    .split("\n")
    .filter((linea) => !linea.trim().startsWith("--"))
    .join("\n");
  return sinComentarios
    .split(";")
    .map((parte) => parte.trim())
    .filter(Boolean);
}

const enlace = env as Env;

await applyD1Migrations(env.DB, [
  { name: "0001_schema.sql", queries: dividirSql(enlace.MIGRATION_SCHEMA ?? "") },
  { name: "0002_reference.sql", queries: dividirSql(enlace.MIGRATION_REFERENCE ?? "") },
  { name: "0004_documento_local.sql", queries: dividirSql(enlace.MIGRATION_FOTO ?? "") },
  { name: "0008_atencion.sql", queries: ["ALTER TABLE citas ADD COLUMN atencion_at TEXT"] },
]);

const TABLAS = [
  "cola_drive",
  "idempotencia",
  "correos_log",
  "auditoria",
  "documentos",
  "sesiones_captura",
  "cita_historial",
  "citas",
  "cupos_bloque",
  "cupos_dia",
  "disponibilidad_examinador",
  "sobrecupos",
  "excepciones_dia",
  "sesiones",
  "intentos_login",
  "ciudadanos",
  "usuarios",
];

beforeEach(async () => {
  for (const tabla of TABLAS) {
    await env.DB.prepare(`DELETE FROM ${tabla}`).run();
  }
});
