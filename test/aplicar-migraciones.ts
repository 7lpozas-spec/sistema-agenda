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
  { name: "0009_tiempos_ficticios.sql", queries: [
    `UPDATE citas
     SET asistencia_marcada_por = COALESCE(asistencia_marcada_por, creado_por),
         asistencia_at = COALESCE(asistencia_at, fecha || 'T' || hora || ':00'),
         atencion_at = datetime(COALESCE(asistencia_at, fecha || 'T' || hora || ':00'), '+' || (12 + (unicode(substr(id, 12, 1)) % 24)) || ' minutes')
     WHERE estado IN ('ASISTIO', 'ATRASADO') AND fecha < '2026-11-25' AND atencion_at IS NULL`,
  ] },
  { name: "0010_espera_minutos.sql", queries: [
    `UPDATE citas
     SET atencion_at = datetime(asistencia_at, '+' || (12 + (unicode(substr(id, 12, 1)) % 24)) || ' minutes')
     WHERE estado IN ('ASISTIO', 'ATRASADO')
       AND asistencia_at IS NOT NULL AND atencion_at IS NOT NULL
       AND abs((julianday(atencion_at) - julianday(asistencia_at)) * 1440) < 2`,
  ] },
  { name: "0011_gracia_cierre.sql", queries: [
    `INSERT INTO parametros (clave, valor, descripcion) VALUES ('gracia_cierre_minutos', '30', 'Minutos después del fin del último bloque para marcar inasistencias.') ON CONFLICT(clave) DO NOTHING`,
  ] },
  { name: "0012_atencion_meson.sql", queries: dividirSql(enlace.MIGRATION_MESON ?? "") },
  { name: "0013_examen_practico.sql", queries: dividirSql(enlace.MIGRATION_EXAMEN ?? "") },
]);

const TABLAS = [
  "atenciones_meson",
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
