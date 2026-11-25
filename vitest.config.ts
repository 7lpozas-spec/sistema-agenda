import { readFileSync } from "node:fs";
import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          AUTO_SEED: "false",
          APP_ENV: "test",
          PHOTO_BACKEND: "r2",
          PBKDF2_ITERATIONS: "1000",
          MIGRATION_SCHEMA: readFileSync(new URL("./migrations/0001_schema.sql", import.meta.url), "utf8"),
          MIGRATION_REFERENCE: readFileSync(new URL("./migrations/0002_referencia.sql", import.meta.url), "utf8"),
          MIGRATION_FOTO: readFileSync(new URL("./migrations/0004_documento_local.sql", import.meta.url), "utf8"),
          MIGRATION_MESON: readFileSync(new URL("./migrations/0012_atencion_meson.sql", import.meta.url), "utf8"),
        },
      },
    }),
  ],
  test: {
    setupFiles: ["./test/aplicar-migraciones.ts"],
    include: ["test/integration/**/*.spec.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
