/** Quita los segmentos APP1 (EXIF) de un JPEG. El resto del archivo se conserva. */
export function quitarExif(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes;
  const partes: Uint8Array[] = [bytes.slice(0, 2)];
  let cursor = 2;
  while (cursor + 4 <= bytes.length) {
    if (bytes[cursor] !== 0xff) {
      partes.push(bytes.slice(cursor));
      break;
    }
    const marcador = bytes[cursor + 1];
    if (marcador === 0xda || marcador === 0xd9) {
      partes.push(bytes.slice(cursor));
      break;
    }
    const largo = (bytes[cursor + 2] << 8) | bytes[cursor + 3];
    if (largo < 2 || cursor + 2 + largo > bytes.length) {
      partes.push(bytes.slice(cursor));
      break;
    }
    const fin = cursor + 2 + largo;
    if (marcador !== 0xe1) partes.push(bytes.slice(cursor, fin));
    cursor = fin;
  }
  const total = partes.reduce((suma, parte) => suma + parte.length, 0);
  const salida = new Uint8Array(total);
  let offset = 0;
  for (const parte of partes) {
    salida.set(parte, offset);
    offset += parte.length;
  }
  return salida;
}

export function tieneExif(bytes: Uint8Array): boolean {
  for (let i = 0; i + 3 < bytes.length; i += 1) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xe1) {
      const texto = new TextDecoder().decode(bytes.slice(i, Math.min(bytes.length, i + 16)));
      if (texto.includes("Exif")) return true;
    }
  }
  return false;
}
