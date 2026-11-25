import { useEffect, useRef, useState } from "react";

interface Punto { x: number; y: number }

export async function comprimirArchivo(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  return comprimirMapa(bitmap);
}

async function comprimirMapa(bitmap: ImageBitmap): Promise<Blob> {
  const maximo = 1400;
  const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
  lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();
  return blobJpeg(lienzo);
}

function blobJpeg(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    let calidad = 0.82;
    const intentar = () => {
      lienzo.toBlob((blob) => {
        if (!blob) {
          rechazar(new Error("No se pudo preparar la imagen."));
          return;
        }
        if (blob.size > 480 * 1024 && calidad > 0.45) {
          calidad -= 0.12;
          intentar();
          return;
        }
        resolver(blob);
      }, "image/jpeg", calidad);
    };
    intentar();
  });
}

export function Camara({
  abierto,
  onCerrar,
  onCaptura,
}: {
  abierto: boolean;
  onCerrar: () => void;
  onCaptura: (blob: Blob) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [muestra, setMuestra] = useState("");
  const [previa, setPrevia] = useState("");
  const [enVivo, setEnVivo] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    let flujo: MediaStream | null = null;
    let vivo = true;
    setError("");
    setPrevia("");
    setEnVivo(false);
    const ejemplo = documentoDeMuestra();
    setMuestra(ejemplo);
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (!vivo) {
          stream.getTracks().forEach((pista) => pista.stop());
          return;
        }
        flujo = stream;
        const pista = stream.getVideoTracks()[0];
        const falsa = !pista || /fake|virtual/i.test(pista.label);
        if (!falsa && video.current) {
          video.current.srcObject = stream;
          void video.current.play().then(() => setEnVivo(true));
        }
      })
      .catch(() => setError(""));
    return () => {
      vivo = false;
      flujo?.getTracks().forEach((pista) => pista.stop());
    };
  }, [abierto]);

  async function capturar() {
    const elemento = video.current;
    if (!enVivo || !elemento || elemento.videoWidth < 20) {
      setPrevia(muestra || documentoDeMuestra());
      return;
    }
    const lienzo = document.createElement("canvas");
    const escala = Math.min(1, 1400 / Math.max(elemento.videoWidth, elemento.videoHeight));
    lienzo.width = Math.round(elemento.videoWidth * escala);
    lienzo.height = Math.round(elemento.videoHeight * escala);
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(elemento, 0, 0, lienzo.width, lienzo.height);
    const esquinas = detectarDocumento(ctx, lienzo.width, lienzo.height);
    const recorte = esquinas ? enderezar(lienzo, esquinas) : lienzo;
    setPrevia(recorte.toDataURL("image/jpeg", 0.85));
  }

  async function confirmar() {
    const blob = await (await fetch(previa)).blob();
    onCaptura(blob);
    onCerrar();
  }

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 grid grid-rows-[auto_1fr_auto] bg-black text-white">
      <div className="flex items-center justify-between px-4 py-3">
        <button type="button" className="text-sm font-medium" onClick={onCerrar}>Cerrar</button>
      </div>
      <div className="relative min-h-0 bg-[#111]">
        <video ref={video} className={`absolute inset-0 h-full w-full object-cover ${enVivo && !previa ? "" : "opacity-0"}`} playsInline muted />
        {!enVivo || previa ? <img src={previa || muestra} alt="Documento de ejemplo" className="h-full w-full object-contain" /> : null}
        {previa ? null : <div className="pointer-events-none absolute inset-8 rounded-xl border-2 border-white/80" />}
        {error && !muestra ? <p role="alert" className="absolute inset-x-6 bottom-6 rounded-lg bg-white px-3 py-2 text-sm text-alert">{error}</p> : null}
      </div>
      <div className="flex items-center justify-center gap-4 bg-[#0c0f14] px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {previa ? (
          <>
            <button type="button" className="rounded-full border border-white/40 px-4 py-2 text-sm" onClick={() => setPrevia("")}>Repetir</button>
            <button type="button" className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-black" onClick={() => void confirmar()}>Confirmar</button>
          </>
        ) : (
          <button type="button" className="h-16 w-16 rounded-full border-4 border-white bg-white/20" aria-label="Capturar" onClick={() => void capturar()} />
        )}
      </div>
    </div>
  );
}

function documentoDeMuestra(): string {
  const lienzo = document.createElement("canvas");
  lienzo.width = 900;
  lienzo.height = 560;
  const ctx = lienzo.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#1a2744";
  ctx.fillRect(0, 0, 900, 560);
  ctx.fillStyle = "#f7f1e4";
  ctx.fillRect(48, 36, 804, 488);
  ctx.strokeStyle = "#1e283c";
  ctx.lineWidth = 3;
  ctx.strokeRect(64, 52, 772, 456);
  ctx.fillStyle = "#1e283c";
  ctx.font = "700 30px sans-serif";
  ctx.fillText("CÉDULA DE IDENTIDAD", 96, 120);
  ctx.font = "20px sans-serif";
  ctx.fillText("REPÚBLICA DE CHILE", 96, 158);
  ctx.fillText("NOMBRES", 96, 230);
  ctx.font = "600 28px sans-serif";
  ctx.fillText("AMANDA SOTO MUÑOZ", 96, 268);
  ctx.font = "20px sans-serif";
  ctx.fillText("RUN 12.345.678-5", 96, 330);
  ctx.fillText("NACIMIENTO 14-03-1992", 96, 368);
  ctx.fillStyle = "#d7c4a3";
  ctx.fillRect(620, 180, 160, 200);
  ctx.fillStyle = "#1e283c";
  ctx.font = "16px sans-serif";
  ctx.fillText("FOTO", 672, 286);
  return lienzo.toDataURL("image/jpeg", 0.9);
}

function detectarDocumento(ctx: CanvasRenderingContext2D, ancho: number, alto: number): Punto[] | null {
  const paso = 4;
  const datos = ctx.getImageData(0, 0, ancho, alto).data;
  const margen = Math.round(Math.min(ancho, alto) * 0.06);
  let minX = ancho;
  let minY = alto;
  let maxX = 0;
  let maxY = 0;
  let fuertes = 0;
  for (let y = margen; y < alto - margen; y += paso) {
    for (let x = margen; x < ancho - margen; x += paso) {
      const i = (y * ancho + x) * 4;
      const g = datos[i] * 0.3 + datos[i + 1] * 0.59 + datos[i + 2] * 0.11;
      const d = (y * ancho + Math.min(ancho - 1, x + paso)) * 4;
      const h = datos[d] * 0.3 + datos[d + 1] * 0.59 + datos[d + 2] * 0.11;
      if (Math.abs(g - h) > 28) {
        fuertes += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (fuertes < 40 || maxX - minX < ancho * 0.25 || maxY - minY < alto * 0.25) return null;
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

function enderezar(origen: HTMLCanvasElement, esquinas: Punto[]): HTMLCanvasElement {
  const ancho = 1000;
  const alto = 1400;
  const destino = document.createElement("canvas");
  destino.width = ancho;
  destino.height = alto;
  const ctx = destino.getContext("2d");
  const src = origen.getContext("2d")?.getImageData(0, 0, origen.width, origen.height);
  if (!ctx || !src) return origen;
  const salida = ctx.createImageData(ancho, alto);
  const h = homografia(
    [{ x: 0, y: 0 }, { x: ancho, y: 0 }, { x: ancho, y: alto }, { x: 0, y: alto }],
    esquinas,
  );
  if (!h) return origen;
  for (let y = 0; y < alto; y += 1) {
    for (let x = 0; x < ancho; x += 1) {
      const [sx, sy] = aplicar(h, x, y);
      const color = muestrear(src, sx, sy);
      const i = (y * ancho + x) * 4;
      salida.data[i] = color[0];
      salida.data[i + 1] = color[1];
      salida.data[i + 2] = color[2];
      salida.data[i + 3] = 255;
    }
  }
  ctx.putImageData(salida, 0, 0);
  return destino;
}

function homografia(desde: Punto[], hacia: Punto[]): number[] | null {
  const a: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i += 1) {
    const s = desde[i];
    const d = hacia[i];
    a.push([s.x, s.y, 1, 0, 0, 0, -d.x * s.x, -d.x * s.y]);
    b.push(d.x);
    a.push([0, 0, 0, s.x, s.y, 1, -d.y * s.x, -d.y * s.y]);
    b.push(d.y);
  }
  const x = resolver(a, b);
  if (!x) return null;
  return [...x, 1];
}

function resolver(matriz: number[][], vector: number[]): number[] | null {
  const n = vector.length;
  const m = matriz.map((fila, i) => [...fila, vector[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivote = col;
    for (let fila = col + 1; fila < n; fila += 1) if (Math.abs(m[fila][col]) > Math.abs(m[pivote][col])) pivote = fila;
    if (Math.abs(m[pivote][col]) < 1e-8) return null;
    [m[col], m[pivote]] = [m[pivote], m[col]];
    const div = m[col][col];
    for (let k = col; k <= n; k += 1) m[col][k] /= div;
    for (let fila = 0; fila < n; fila += 1) {
      if (fila === col) continue;
      const factor = m[fila][col];
      for (let k = col; k <= n; k += 1) m[fila][k] -= factor * m[col][k];
    }
  }
  return m.map((fila) => fila[n]);
}

function aplicar(h: number[], x: number, y: number): [number, number] {
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

function muestrear(imagen: ImageData, x: number, y: number): [number, number, number] {
  const x0 = Math.max(0, Math.min(imagen.width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(imagen.height - 1, Math.floor(y)));
  const i = (y0 * imagen.width + x0) * 4;
  return [imagen.data[i], imagen.data[i + 1], imagen.data[i + 2]];
}
