import { describe, expect, it } from "vitest";
import { puedeCrearCita, puedeVerAgenda } from "../../src/domain/permisos";
import { limpiarLinea, correoValido } from "../../src/domain/texto";
import { cabecerasDeSeguridad } from "../../src/security/cabeceras";
import { contrasenaAceptable, hashContrasena, verificarContrasena } from "../../src/security/claves";

describe("permisos y cabeceras", () => {
  it("separa las agendas y publica cabeceras", async () => {
    expect(puedeCrearCita("OPERADOR_AGENDA", "GENERAL")).toBe(true);
    expect(puedeCrearCita("OPERADOR_AGENDA", "PRIMERA_VEZ")).toBe(true);
    expect(puedeCrearCita("INSTRUCTOR", "GENERAL")).toBe(false);
    expect(puedeVerAgenda("OPERADOR_AGENDA", "PRIMERA_VEZ")).toBe(true);
    expect(puedeVerAgenda("INSTRUCTOR", "PRIMERA_VEZ")).toBe(true);
    expect(puedeVerAgenda("INSTRUCTOR", "GENERAL")).toBe(false);
    expect(limpiarLinea("  Ana  ")).toBe("Ana");
    expect(correoValido("ana@ejemplo.cl")).toBe(true);
    expect(cabecerasDeSeguridad(true)["Content-Security-Policy"]).toContain("script-src 'self'");
    expect(contrasenaAceptable("Clave-Unitaria-2026a")).toBe(true);
    const hash = await hashContrasena("Clave-Unitaria-2026a", 1000);
    expect(await verificarContrasena("Clave-Unitaria-2026a", hash)).toBe(true);
    expect(await verificarContrasena("otra-clave-distinta", hash)).toBe(false);
  });
});
