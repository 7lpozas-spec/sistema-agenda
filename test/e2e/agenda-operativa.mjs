import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
const base = process.env.BASE_URL ?? "http://127.0.0.1:43123";
const clave = process.env.LICENCIAS_CLAVE_OPERADOR;
assert.ok(clave, "Falta LICENCIAS_CLAVE_OPERADOR");
const salida = process.env.ARTIFACTS_DIR ?? "test-results/agenda-operativa";
mkdirSync(salida, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
const page = await context.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message));
page.setDefaultTimeout(20000);
function dv(cuerpo) {
  let sum = 0,
    m = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    sum += Number(cuerpo[i]) * m;
    m = m === 7 ? 2 : m + 1;
  }
  const r = 11 - (sum % 11);
  return r === 11 ? "0" : r === 10 ? "K" : String(r);
}
try {
  await page.goto(base + "/login");
  await page.getByLabel("Correo", { exact: true }).fill("operador@ejemplo.cl");
  await page.getByLabel("Contraseña", { exact: true }).fill(clave);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  const huecos = await page.evaluate(
    async () =>
      await (await fetch("/api/huecos?agenda=GENERAL&limite=40")).json(),
  );
  const opciones = huecos.agendas[0].siguientes;
  const hueco = opciones.find((h) => h.libres >= 2) ?? opciones[0];
  assert.ok(hueco, "Se requiere al menos un bloque libre de la semilla");
  const ruta = base + `/agenda/general?fecha=${hueco.fecha}&vista=dia`;
  await page.goto(ruta);
  await page.getByRole("heading", { name: "Jornada del día" }).waitFor();
  const otra = await context.newPage();
  await otra.goto(ruta);
  await otra.getByRole("heading", { name: "Jornada del día" }).waitFor();
  await page
    .getByRole("link", { name: `Reservar ${hueco.hora}`, exact: true })
    .click();
  await page.getByLabel("RUT", { exact: true }).fill("30000000-2");
  await page.getByRole("button", { name: "Buscar RUT", exact: true }).click();
  await page.getByText("Datos recuperados.", { exact: false }).waitFor();
  assert.equal(
    await page.getByLabel("Nombres", { exact: true }).inputValue(),
    "Nora",
  );
  const cuerpo = String(33000000 + (Date.now() % 1000000));
  await page.getByLabel("RUT", { exact: true }).fill(cuerpo + "-" + dv(cuerpo));
  assert.equal(
    await page.getByLabel("Nombres", { exact: true }).inputValue(),
    "",
  );
  await page.getByLabel("Nombres", { exact: true }).fill("Prueba Interfaz");
  await page
    .getByLabel("Apellidos", { exact: true })
    .fill("Variante " + cuerpo);
  await page.getByLabel("No tiene correo").check();
  await page.getByLabel("Domicilio en Recoleta").check();
  let envios = 0;
  let claveEnvio = "";
  await page.route("**/api/citas", async (route) => {
    if (route.request().method() === "POST") {
      envios++;
      claveEnvio = route.request().headers()["idempotency-key"];
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Confirmar reserva", exact: true })
    .evaluate((b) => {
      b.click();
      b.click();
    });
  await page
    .getByRole("heading", { name: "Cita agendada", exact: true })
    .waitFor();
  assert.equal(envios, 1);
  assert.ok(claveEnvio);
  await page.unroute("**/api/citas");
  await otra.getByRole("button", { name: new RegExp(cuerpo) }).waitFor();
  await page
    .getByRole("link", { name: "Volver a la agenda", exact: true })
    .click();
  assert.equal(new URL(page.url()).searchParams.get("fecha"), hueco.fecha);
  const persona = page.getByRole("button", { name: new RegExp(cuerpo) });
  await persona.click();
  const panel = page.getByRole("complementary", { name: "Detalle de la cita" });
  await panel.getByRole("heading", { name: new RegExp(cuerpo) }).waitFor();
  if (hueco.libres > 1)
    await page
      .getByRole("link", { name: `Reservar ${hueco.hora}`, exact: true })
      .waitFor();
  await page.screenshot({
    path: salida + "/agenda-escritorio.png",
    fullPage: false,
  });
  await page.getByLabel("Buscar en el día", { exact: true }).fill(cuerpo);
  assert.equal(
    await page
      .locator('button[aria-pressed="true"]')
      .filter({ hasText: cuerpo })
      .count(),
    1,
  );
  await page
    .getByLabel("Buscar en el día", { exact: true })
    .fill("persona inexistente xyz");
  await page
    .getByText("No hay citas con ese filtro", { exact: true })
    .waitFor();
  await page.getByLabel("Buscar en el día", { exact: true }).fill("");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: salida + "/agenda-movil.png", fullPage: true });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Desborde horizontal móvil",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.route("**/api/agendas/GENERAL/dia/*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ mensaje: "Fallo de conexión simulado" }),
    }),
  );
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Fallo de conexión simulado" })
    .waitFor();
  assert.equal(
    await page
      .getByText("Sin bloques habilitados esta semana", { exact: true })
      .count(),
    0,
  );
  await page.unroute("**/api/agendas/GENERAL/dia/*");
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await page.getByRole("table", { name: "Agenda semanal" }).waitFor();
  await page.getByRole("button", { name: "Mes", exact: true }).click();
  await page
    .getByRole("button", { name: "Mes siguiente", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mes anterior", exact: true })
    .waitFor();
  await otra.close();
  assert.deepEqual(errores, []);
  console.log(
    "OK: reserva por interfaz, doble clic, clave de reintento, RUT, cupos parciales, segunda ventana en vivo, filtros, ficha, móvil y error/reintento semanal.",
  );
} finally {
  await browser.close();
}
