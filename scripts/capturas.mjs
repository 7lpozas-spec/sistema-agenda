import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const base = process.env.BASE_URL ?? "http://127.0.0.1:43123";
const ronda = process.argv[2] ?? "r1";
const salida = `/opt/cursor/artifacts/${ronda}`;
await mkdir(salida, { recursive: true });

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });

async function entrar(page, email, clave) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill(clave);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
  await page.getByRole("heading", { level: 1 }).waitFor();
}

async function shot(page, nombre) {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${salida}/${nombre}.png`, fullPage: false });
}

const desk = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desk.newPage();
page.setDefaultTimeout(60_000);

await page.goto(`${base}/login`);
await page.getByRole("heading", { name: "Ingreso" }).waitFor();
await shot(page, "01-ingreso-1440");

await entrar(page, "operador@ejemplo.cl", process.env.LICENCIAS_CLAVE_OPERADOR ?? "");
await page.getByRole("heading", { name: /Buenos|Buenas/ }).waitFor();
await shot(page, "02-hoy-1440");

await page.getByRole("button", { name: "Abrir calendario" }).first().click();
await page.getByRole("dialog").waitFor();
await shot(page, "03-fecha-1440");
await page.keyboard.press("Escape");

await page.getByRole("link", { name: "Estadísticas" }).click();
await page.getByRole("heading", { name: "Estadísticas" }).waitFor();
await page.getByText("vs semana anterior").waitFor();
await shot(page, "04-estadisticas-1440");

await page.getByRole("link", { name: "Agenda general", exact: true }).click();
await page.getByRole("tab", { name: "Semana" }).click();
await page.getByRole("columnheader", { name: /Lun|Mar|Mié|Jue|Vie|Sáb/ }).first().waitFor();
await shot(page, "05-semana-1440");

await page.getByRole("tab", { name: "Día" }).click();
await page.getByRole("rowheader", { name: /08:30/ }).first().waitFor();
await shot(page, "06-dia-1440");

await page.getByRole("tab", { name: "Mes" }).click();
await page.getByRole("button", { name: "Mes siguiente" }).waitFor();
await shot(page, "07-mes-1440");

await page.getByRole("link", { name: "Nueva cita" }).click();
await page.getByRole("heading", { name: "Nueva cita" }).waitFor();
await shot(page, "08-nueva-1440");

await page.getByRole("link", { name: "Atención", exact: true }).click();
await page.getByRole("heading", { name: "Atención" }).waitFor();
await page.getByText(/Agendada|Sin citas/).first().waitFor();
await shot(page, "09-atencion-1440");

await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Sin hora" }).click();
await page.getByRole("heading", { name: "Sin hora" }).waitFor();
await shot(page, "10-sin-hora-1440");

const id = await page.evaluate(async () => {
  const respuesta = await fetch("/api/lista-dia");
  const datos = await respuesta.json();
  return datos.citas?.[0]?.id ?? "";
});
if (id) {
  await page.goto(`${base}/citas/${id}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await shot(page, "11-cita-1440");
}

await page.getByRole("button", { name: "Salir" }).click();
await page.getByRole("heading", { name: "Ingreso" }).waitFor();
await entrar(page, "admin@ejemplo.cl", process.env.LICENCIAS_CLAVE_ADMIN ?? "");
await page.goto(`${base}/admin`);
await page.getByRole("heading", { name: "Administración" }).waitFor();
await page.getByLabel("Zona horaria").waitFor();
await shot(page, "12-admin-1440");
await page.getByRole("tab", { name: "Cuentas" }).click();
await page.getByText("Diego Prueba Operador").waitFor();
await shot(page, "13-cuentas-1440");

await page.getByRole("button", { name: "Salir" }).click();
await entrar(page, "instructor@ejemplo.cl", process.env.LICENCIAS_CLAVE_INSTRUCTOR ?? "");
await page.getByRole("heading", { name: /Primera vez|Agenda/ }).waitFor();
await shot(page, "14-instructor-1440");
await page.goto(`${base}/atencion`);
await page.getByRole("heading", { name: "Atención" }).waitFor();
await shot(page, "15-instructor-atencion-1440");

const movil = await browser.newContext({ viewport: { width: 390, height: 844 } });
const cel = await movil.newPage();
cel.setDefaultTimeout(60_000);
await cel.goto(`${base}/login`);
await cel.getByRole("heading", { name: "Ingreso" }).waitFor();
await shot(cel, "16-ingreso-390");
await entrar(cel, "operador@ejemplo.cl", process.env.LICENCIAS_CLAVE_OPERADOR ?? "");
await shot(cel, "17-hoy-390");
await cel.getByRole("button", { name: "Abrir menú" }).click();
await shot(cel, "18-menu-390");
await cel.getByRole("button", { name: "Atención" }).click();
await cel.getByRole("heading", { name: "Atención" }).waitFor();
await shot(cel, "19-atencion-390");
if (id) {
  await cel.goto(`${base}/citas/${id}`);
  await cel.getByRole("button", { name: "Cámara" }).click();
  await cel.getByRole("img", { name: "Documento de ejemplo" }).waitFor();
  await shot(cel, "20-camara-390");
  await cel.getByRole("button", { name: "Capturar" }).click();
  await cel.getByRole("button", { name: "Confirmar" }).waitFor();
  await shot(cel, "21-camara-previa-390");
}

await browser.close();
console.log("ok", salida);
