import { afterEach, describe, expect, it, vi } from "vitest";
import {
  crearCorreo,
  despachar,
  type Mensaje,
} from "../../src/servicios/correo";
const mensaje: Mensaje = {
  citaId: "demo",
  tipo: "CONFIRMACION",
  destinatario: "persona@ejemplo.cl",
  asunto: "Cita",
  html: "Cita",
  texto: "Cita",
};
afterEach(() => vi.unstubAllGlobals());
describe("Envío real de correo", () => {
  it("no simula éxito cuando falta el proveedor", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const resultado = await crearCorreo({} as Env).enviar(mensaje);
    expect(resultado.ok).toBe(false);
    expect(resultado.error).toContain("no configurado");
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([true, false])(
    "registra el resultado del proveedor: %s",
    async (ok) => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(new Response(null, { status: ok ? 200 : 503 })),
      );
      const run = vi.fn().mockResolvedValue({});
      const bind = vi.fn().mockReturnValue({ run });
      const env = {
        MAIL_API_URL: "https://correo.example/enviar",
        MAIL_API_KEY: "demo",
        DB: { prepare: vi.fn().mockReturnValue({ bind }) },
      } as unknown as Env;
      expect(await despachar(env, mensaje)).toBe(ok);
      expect(bind.mock.calls[0][4]).toBe(ok ? "ENVIADO" : "ERROR");
      expect(run).toHaveBeenCalledOnce();
    },
  );
  it("registra un error de red y no devuelve éxito", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Sin conexión")),
    );
    const bind = vi
      .fn()
      .mockReturnValue({ run: vi.fn().mockResolvedValue({}) });
    const env = {
      MAIL_API_URL: "https://correo.example/enviar",
      MAIL_API_KEY: "demo",
      DB: { prepare: vi.fn().mockReturnValue({ bind }) },
    } as unknown as Env;
    expect(await despachar(env, mensaje)).toBe(false);
    expect(bind.mock.calls[0][4]).toBe("ERROR");
  });
});
