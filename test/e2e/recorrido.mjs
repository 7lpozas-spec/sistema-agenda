import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://127.0.0.1:43123";

function clave(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} en el entorno. No está en el repositorio.`);
  return valor;
}
const salida = process.env.ARTIFACTS_DIR ?? "test-results/recorrido";
mkdirSync(salida, { recursive: true });

function dv(cuerpo) {
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }
  const resto = 11 - (suma % 11);
  if (resto === 11) return "0";
  if (resto === 10) return "K";
  return String(resto);
}

function fechaEn(dias) {
  const instante = new Date(Date.now() + dias * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instante);
}

async function entrar(page, correo, contrasena) {
  await page.goto(`${base}/login`);
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill(contrasena);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("heading", { level: 1 }).first().waitFor();
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const contexto = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await contexto.newPage();
page.setDefaultTimeout(90_000);

function digito(cuerpo) {
  let suma = 0;
  let factor = 2;
  for (const c of String(cuerpo).split("").reverse()) {
    suma += Number(c) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? "0" : resto === 10 ? "K" : String(resto);
}

try {
  await page.goto(`${base}/login`);
  await page.getByRole("heading", { name: "Ingreso" }).waitFor();
  await page.screenshot({ path: `${salida}/01-ingreso.png`, fullPage: false });

  const movil = await browser.newContext({ viewport: { width: 390, height: 844 } }).then((ctx) => ctx.newPage());
  await movil.goto(`${base}/login`);
  await movil.getByRole("heading", { name: "Ingreso" }).waitFor();
  await movil.screenshot({ path: `${salida}/02-ingreso-movil.png`, fullPage: false });
  await movil.close();

  await entrar(page, "operador@ejemplo.cl", clave("LICENCIAS_CLAVE_OPERADOR"));
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Hoy", exact: true }).count(), 0);
  assert.equal(await page.getByRole("link", { name: "Atención", exact: true }).count(), 0);
  assert.equal(await page.getByRole("link", { name: "Sin hora" }).count(), 0);
  await page.screenshot({ path: `${salida}/03-inicio.png`, fullPage: true });
  const descarga = page.waitForEvent("download");
  await page.getByRole("link", { name: "Descargar Excel" }).click();
  const archivo = await descarga;
  assert.match(archivo.suggestedFilename(), /\.xlsx$/);
  await archivo.saveAs(`${salida}/estadisticas.xlsx`);

  await page.getByRole("link", { name: "Agenda general", exact: true }).click();
  await page.waitForURL("**/agenda/general");
  await page.getByRole("heading", { level: 1, name: "Agenda general" }).waitFor();
  await page.getByText("08:30", { exact: true }).first().waitFor();
  await page.screenshot({ path: `${salida}/04-agenda-general.png`, fullPage: true });
  assert.equal(await page.getByText("08:30", { exact: true }).count() > 0, true);
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await page.getByRole("rowheader", { name: "08:30" }).first().waitFor();
  await page.screenshot({ path: `${salida}/11-calendario-semana.png`, fullPage: true });
  await page.getByRole("button", { name: "Mes", exact: true }).click();
  await page.getByRole("button", { name: "Mes siguiente" }).waitFor();
  await page.screenshot({ path: `${salida}/12-calendario-mes.png`, fullPage: true });
  await page.getByRole("button", { name: "Día", exact: true }).click();
  await page.goto(`${base}/citas/nueva`);
  await page.getByRole("heading", { name: "Nueva cita" }).waitFor();
  await page.screenshot({ path: `${salida}/05-nueva-cita.png`, fullPage: true });

  const creada = await page.evaluate(async () => {
    const csrf = decodeURIComponent((document.cookie.split("; ").find((item) => item.startsWith("lic_csrf=")) ?? "").slice(9));
    function digito(cuerpo) {
      let suma = 0;
      let multiplicador = 2;
      for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
        suma += Number(cuerpo[i]) * multiplicador;
        multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
      }
      const resto = 11 - (suma % 11);
      if (resto === 11) return "0";
      if (resto === 10) return "K";
      return String(resto);
    }
    const cuerpo = String(32000000 + (Date.now() % 1000000));
    const rut = `${cuerpo}-${digito(cuerpo)}`;
    let ultimo = "";
    for (let dia = 2; dia < 40; dia += 1) {
      const fecha = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(Date.now() + dia * 86400000));
      for (const hora of ["10:15", "11:15", "14:00", "14:45"]) {
        const respuesta = await fetch("/api/citas", {
          method: "POST",
          headers: { "content-type": "application/json", "x-csrf-token": csrf },
          body: JSON.stringify({
            tipoTramiteId: "CONTROL_RENOVACION",
            fecha,
            hora,
            canal: "PRESENCIAL",
            ciudadano: { rut, nombres: "Foto", apellidos: "Ficticia", email: "foto.ficticia@ejemplo.cl" },
          }),
        });
        if (respuesta.status === 201) return respuesta.json();
        ultimo = `${respuesta.status} ${await respuesta.text()}`;
      }
    }
    return { error: ultimo };
  });
  assert.ok(creada?.cita?.id, `no hubo cupo libre para la captura de prueba: ${creada?.error ?? ""}`);
  await page.goto(`${base}/citas/${creada.cita.id}`);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.screenshot({ path: `${salida}/13-cita.png`, fullPage: false });
  const cel = await contexto.newPage();
  await cel.setViewportSize({ width: 390, height: 844 });
  cel.setDefaultTimeout(90_000);
  await cel.goto(`${base}/`);
  await cel.getByRole("heading", { name: "Dashboard" }).waitFor();
  await cel.screenshot({ path: `${salida}/14-movil-lista.png`, fullPage: false });
  await cel.goto(`${base}/citas/${creada.cita.id}`);
  await cel.getByRole("button", { name: "Fotografiar Carnet, frente" }).click();
  await cel.getByRole("button", { name: "Capturar" }).waitFor();
  await cel.waitForTimeout(800);
  await cel.screenshot({ path: `${salida}/15-movil-camara.png`, fullPage: false });
  await cel.getByRole("button", { name: "Capturar" }).click();
  await cel.getByRole("button", { name: "Usar foto" }).click();
  await page.getByRole("img", { name: "Carnet, frente" }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Comprobante" }).count(), 0);
  const antes = await page.evaluate(async (id) => (await fetch(`/api/citas/${id}/comprobante.pdf`, { credentials: "same-origin" })).status, creada.cita.id);
  assert.equal(antes, 409);
  const jpeg = Buffer.from((await cel.evaluate(() => {
    const lienzo = document.createElement("canvas");
    lienzo.width = 856;
    lienzo.height = 540;
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#dfe8f5";
    ctx.fillRect(0, 0, 856, 540);
    ctx.fillStyle = "#1d3557";
    ctx.font = "48px sans-serif";
    ctx.fillText("DOCUMENTO FICTICIO", 160, 280);
    return lienzo.toDataURL("image/jpeg", 0.8);
  })).split(",")[1], "base64");
  for (const doc of ["Carnet, reverso", "Licencia, frente", "Licencia, reverso"]) {
    await cel.getByRole("dialog", { name: doc }).waitFor();
    await cel.getByLabel("Subir archivo").setInputFiles({ name: "doc.jpg", mimeType: "image/jpeg", buffer: jpeg });
    await page.getByRole("img", { name: doc }).waitFor();
  }
  await page.getByRole("link", { name: "Emitir comprobante" }).waitFor();
  const pdf = await page.evaluate(async (id) => {
    const r = await fetch(`/api/citas/${id}/comprobante.pdf`, { credentials: "same-origin" });
    return { status: r.status, tipo: r.headers.get("content-type") };
  }, creada.cita.id);
  assert.equal(pdf.status, 200);
  assert.match(pdf.tipo ?? "", /pdf/);
  for (const doc of ["Carnet, frente", "Licencia, reverso"]) {
    await page.waitForFunction((nombre) => { const img = document.querySelector(`img[alt="${nombre}"]`); return Boolean(img && img.complete && img.naturalWidth > 0); }, doc);
  }
  await page.screenshot({ path: `${salida}/16-foto-en-pc.png`, fullPage: false });
  await cel.close();

  await page.getByRole("button", { name: "Salir" }).click();
  await page.getByRole("heading", { name: "Ingreso" }).waitFor();
  await entrar(page, "instructor@ejemplo.cl", clave("LICENCIAS_CLAVE_INSTRUCTOR"));
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Agenda general", exact: true }).count(), 0);
  assert.equal(await page.getByRole("link", { name: "Atención", exact: true }).count(), 0);
  await page.getByRole("link", { name: "Primera vez", exact: true }).click();
  await page.getByRole("heading", { name: "Agenda primera vez" }).waitFor();
  await page.screenshot({ path: `${salida}/06-atencion.png`, fullPage: true });

  await page.getByRole("button", { name: "Salir" }).click();
  await entrar(page, "recepcion@ejemplo.cl", clave("LICENCIAS_CLAVE_RECEPCION"));
  await page.getByRole("heading", { name: "Atención del día" }).waitFor();
  await page.getByRole("tab", { name: /Sin hora/ }).click();
  const cuerpoRut = 31000600 + Math.floor(Math.random() * 300000);
  const nombreSinHora = `Persona Ficticia ${cuerpoRut % 1000}`;
  const formulario = page.getByRole("form", { name: "Registrar sin hora" });
  await formulario.getByLabel("RUT").fill(`${cuerpoRut}${digito(cuerpoRut)}`);
  await formulario.getByLabel("Nombre").fill(nombreSinHora);
  await formulario.getByLabel("Servicio").selectOption({ index: 0 });
  await formulario.getByRole("button", { name: "Registrar" }).click();
  await page.getByRole("cell", { name: new RegExp(nombreSinHora) }).first().waitFor();
  await page.screenshot({ path: `${salida}/07-sin-hora.png`, fullPage: false });

  await page.getByRole("button", { name: "Salir" }).click();
  await entrar(page, "admin@ejemplo.cl", clave("LICENCIAS_CLAVE_ADMIN"));
  await page.goto(`${base}/admin`);
  await page.getByRole("heading", { name: "Administración" }).waitFor();
  await page.getByLabel("Zona horaria").waitFor();
  assert.equal(await page.getByLabel("Zona horaria").inputValue(), "America/Santiago");
  assert.equal(await page.getByLabel("Retención de fotos").inputValue(), "12");
  await page.getByLabel("Correo remitente").fill("licencias@ejemplo.cl");
  await Promise.all([
    page.waitForResponse((respuesta) => respuesta.url().includes("/api/parametros") && respuesta.request().method() === "PATCH" && respuesta.ok()),
    page.getByRole("button", { name: "Guardar", exact: true }).click(),
  ]);
  await page.screenshot({ path: `${salida}/08-parametros.png`, fullPage: true });
  await page.getByRole("tab", { name: "Cuentas" }).click();
  await page.getByText("admin@ejemplo.cl").waitFor();
  await page.screenshot({ path: `${salida}/09-cuentas.png`, fullPage: true });

  await page.goto(`${base}/agenda/primera_vez`);
  await page.getByRole("heading", { name: "Agenda primera vez" }).waitFor();
  await page.screenshot({ path: `${salida}/10-primera-vez.png`, fullPage: true });
  console.log("recorrido e2e ok");
} finally {
  await browser.close();
}
