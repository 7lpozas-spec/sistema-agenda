import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { digitoVerificador } from "../../src/domain/rut";
import { entrar, llamar } from "../soporte";

function rut(cuerpo: number): string {
  return `${cuerpo}-${digitoVerificador(String(cuerpo))}`;
}
function cuerpo<T>(respuesta: { json: unknown }): T {
  return respuesta.json as T;
}
interface Atencion { id: string; numero: number; numeroTexto: string; estado: string; servicio: string }

describe("atención sin hora en mesón", () => {
  it("solo administración y recepción usan el mesón", async () => {
    const operador = await entrar("OPERADOR_AGENDA");
    const instructor = await entrar("INSTRUCTOR");
    const recepcion = await entrar("RECEPCION");
    const admin = await entrar("ADMIN");
    const datos = { rut: rut(31000500), nombre: "Lucía Ficticia Prueba", servicioId: "CONSULTA" };
    for (const sesion of [operador, instructor]) {
      expect((await llamar("/meson", { sesion })).status).toBe(403);
      expect((await llamar("/meson/servicios", { sesion })).status).toBe(403);
      expect((await llamar(`/meson/persona?rut=${datos.rut}`, { sesion })).status).toBe(403);
      expect((await llamar("/meson", { method: "POST", sesion, body: datos })).status).toBe(403);
    }
    expect((await llamar("/meson", { sesion: recepcion })).status).toBe(200);
    expect((await llamar("/meson", { sesion: admin })).status).toBe(200);
    expect((await llamar("/meson?fecha=2026-01-05", { sesion: recepcion })).status).toBe(403);
    expect((await llamar("/meson?fecha=2026-01-05", { sesion: admin })).status).toBe(200);
    expect((await llamar("/config/servicios-meson", { method: "POST", sesion: recepcion, body: { nombre: "Servicio no permitido" } })).status).toBe(403);
    expect((await llamar("/export/meson.csv", { sesion: recepcion })).status).toBe(403);
  });

  it("numera el día, bloquea duplicados abiertos y valida el RUT", async () => {
    const recepcion = await entrar("RECEPCION");
    const malo = await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: "31000500-0", nombre: "Persona Ficticia", servicioId: "CONSULTA" } });
    expect(malo.status).toBe(400);
    const sinServicio = await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000501), nombre: "Persona Ficticia", servicioId: "NO_EXISTE" } });
    expect(sinServicio.status).toBeGreaterThanOrEqual(400);
    const primera = await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000501), nombre: "Ana Ficticia Uno", servicioId: "CONSULTA", observacion: "Consulta por renovación" } });
    expect(primera.status).toBe(201);
    const segunda = await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000502), nombre: "Beto Ficticio Dos", servicioId: "RETIRO_LICENCIA" } });
    expect(segunda.status).toBe(201);
    const a = cuerpo<{ atencion: Atencion }>(primera).atencion;
    const b = cuerpo<{ atencion: Atencion }>(segunda).atencion;
    expect(b.numero).toBe(a.numero + 1);
    expect(a.numeroTexto).toMatch(/^S-\d{3}$/);
    expect(a.estado).toBe("EN_ESPERA");
    const repetida = await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000501), nombre: "Ana Ficticia Uno", servicioId: "CONSULTA" } });
    expect(repetida.status).toBe(409);
    const otroServicio = await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000501), nombre: "Ana Ficticia Uno", servicioId: "CERTIFICADO" } });
    expect(otroServicio.status).toBe(201);
    const lista = cuerpo<{ atenciones: { id: string; rut: string }[]; resumen: { total: number } }>(await llamar("/meson", { sesion: recepcion }));
    expect(lista.atenciones).toHaveLength(3);
    expect(lista.atenciones[0].rut).toContain("*");
    expect(lista.resumen.total).toBe(3);
  });

  it("recorre los estados y rechaza saltos inválidos o concurrentes", async () => {
    const recepcion = await entrar("RECEPCION");
    const creada = cuerpo<{ atencion: Atencion }>(await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000510), nombre: "Carla Ficticia Tres", servicioId: "DUPLICADO" } })).atencion;
    const estado = (valor: string) => llamar(`/meson/${creada.id}/estado`, { method: "POST", sesion: recepcion, body: { estado: valor } });
    expect((await estado("EN_ATENCION")).status).toBe(200);
    expect((await estado("ATENDIDO")).status).toBe(200);
    const fila = await env.DB.prepare("SELECT estado, atencion_at, termino_at, atendido_por FROM atenciones_meson WHERE id = ?").bind(creada.id).first<{ estado: string; atencion_at: string | null; termino_at: string | null; atendido_por: string | null }>();
    expect(fila?.estado).toBe("ATENDIDO");
    expect(fila?.atencion_at).toBeTruthy();
    expect(fila?.termino_at).toBeTruthy();
    expect(fila?.atendido_por).toBeTruthy();
    expect((await estado("SE_RETIRO")).status).toBe(409);
    expect((await estado("EN_ESPERA")).status).toBe(200);
    expect((await estado("SE_RETIRO")).status).toBe(200);
    expect((await estado("INVENTADO")).status).toBe(400);
    const iguales = await Promise.all([estado("EN_ESPERA"), estado("EN_ESPERA")]);
    expect(iguales.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("autocompleta por RUT y avisa la cita del día", async () => {
    const recepcion = await entrar("RECEPCION");
    const nuevo = cuerpo<{ nombre: string | null; visitas: number }>(await llamar(`/meson/persona?rut=${rut(31000520)}`, { sesion: recepcion }));
    expect(nuevo.nombre ?? null).toBeNull();
    expect(nuevo.visitas).toBe(0);
    await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000520), nombre: "Diego Ficticio Cuatro", servicioId: "CONSULTA" } });
    const conocido = cuerpo<{ nombre: string | null; visitas: number }>(await llamar(`/meson/persona?rut=${rut(31000520)}`, { sesion: recepcion }));
    expect(conocido.nombre).toBe("Diego Ficticio Cuatro");
    expect(conocido.visitas).toBe(1);
    expect((await llamar("/meson/persona?rut=123", { sesion: recepcion })).status).toBe(400);
  });

  it("administración configura servicios y exporta", async () => {
    const admin = await entrar("ADMIN");
    const recepcion = await entrar("RECEPCION");
    const nombre = `Trámite ficticio ${crypto.randomUUID().slice(0, 6)}`;
    const creado = await llamar("/config/servicios-meson", { method: "POST", sesion: admin, body: { nombre } });
    expect(creado.status).toBe(201);
    const id = cuerpo<{ servicio: { id: string } }>(creado).servicio.id;
    expect((await llamar("/config/servicios-meson", { method: "POST", sesion: admin, body: { nombre } })).status).toBe(409);
    expect((await llamar(`/config/servicios-meson/${id}`, { method: "PATCH", sesion: admin, body: { activo: false } })).status).toBe(200);
    const visibles = cuerpo<{ servicios: { id: string }[] }>(await llamar("/meson/servicios", { sesion: recepcion })).servicios.map((s) => s.id);
    expect(visibles).not.toContain(id);
    const todos = cuerpo<{ servicios: { id: string }[] }>(await llamar("/meson/servicios?todos=1", { sesion: admin })).servicios.map((s) => s.id);
    expect(todos).toContain(id);
    expect((await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000530), nombre: "Elena Ficticia Cinco", servicioId: id } })).status).toBeGreaterThanOrEqual(400);
    await llamar("/meson", { method: "POST", sesion: recepcion, body: { rut: rut(31000531), nombre: "Fabián Ficticio Seis", servicioId: "CONSULTA" } });
    const csv = await llamar("/export/meson.csv", { sesion: admin });
    expect(csv.status).toBe(200);
    const texto = new TextDecoder().decode(csv.binario);
    expect(texto).toContain("Fabián Ficticio Seis");
    expect(texto).toContain("Consulta e información");
    const panel = cuerpo<{ meson?: { hoy: { total: number } } }>(await llamar("/panel", { sesion: admin }));
    expect(panel.meson?.hoy.total).toBe(1);
  });
});
