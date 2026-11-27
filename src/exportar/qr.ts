// @ts-expect-error El núcleo de qrcode no trae tipos. Es JavaScript puro y corre en el Worker.
import { create } from "qrcode/lib/core/qrcode.js";

/** Módulos del código QR, sin margen. true es un módulo oscuro. */
export function modulosQr(texto: string): boolean[][] {
  const simbolo = create(texto, { errorCorrectionLevel: "M" }) as { modules: { size: number; data: Uint8Array } };
  const { size, data } = simbolo.modules;
  const filas: boolean[][] = [];
  for (let f = 0; f < size; f += 1) {
    const fila: boolean[] = [];
    for (let c = 0; c < size; c += 1) fila.push(Boolean(data[f * size + c]));
    filas.push(fila);
  }
  return filas;
}
