import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const config = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const bloque = config.split('"env"')[1] ?? "";
const id = bloque.match(/"database_id":\s*"([^"]+)"/)?.[1] ?? "";
if (!id || id.startsWith("00000000-")) {
  console.error(`El entorno de prueba todavía tiene el id marcador (${id || "vacío"}).

Hace falta, con una cuenta de Cloudflare y solo datos ficticios:

1. npx wrangler login
2. npx wrangler d1 create licencias_recoleta_test
3. Pegar el database_id en wrangler.jsonc → env.test.d1_databases[0]
4. npx wrangler r2 bucket create licencias-recoleta-fotos-test
5. Volver a correr npm run deploy:test

El script publica el Worker agendamiento-licencias-recoleta-test y aplica las migraciones en la D1 remota de prueba. No use una base con datos reales.
Detalle: docs/despliegue-prueba.md`);
  process.exit(1);
}

const who = spawnSync("npx", ["wrangler", "whoami"], { stdio: "inherit" });
if (who.status !== 0) {
  console.error("Wrangler no tiene sesión. Corra npx wrangler login, o exporte CLOUDFLARE_API_TOKEN, y repita npm run deploy:test.");
  process.exit(who.status ?? 1);
}

const deploy = spawnSync("npx", ["wrangler", "deploy", "--env", "test"], { stdio: "inherit" });
if (deploy.status !== 0) process.exit(deploy.status ?? 1);
const migrate = spawnSync(
  "npx",
  ["wrangler", "d1", "migrations", "apply", "licencias_recoleta_test", "--remote", "--env", "test"],
  { stdio: "inherit" },
);
process.exit(migrate.status ?? 1);
