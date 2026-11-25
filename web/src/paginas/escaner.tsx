import { useEffect, useRef, useState } from "react";

const LADO_MAXIMO = 1600;
const PESO_MAXIMO = 480 * 1024;
/** Proporción de una cédula o licencia (85,6 × 54 mm). */
const PROPORCION = 85.6 / 54;

export async function comprimirArchivo(archivo: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo, { imageOrientation: "from-image" });
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
  lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar la imagen.");
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();
  return jpeg(lienzo);
}

export function jpeg(lienzo: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rechazar) => {
    let calidad = 0.85;
    const intentar = () => {
      lienzo.toBlob((blob) => {
        if (!blob) {
          rechazar(new Error("No se pudo preparar la imagen."));
          return;
        }
        if (blob.size > PESO_MAXIMO && calidad > 0.4) {
          calidad -= 0.1;
          intentar();
          return;
        }
        resolver(blob);
      }, "image/jpeg", calidad);
    };
    intentar();
  });
}

/** Marco guía dentro del contenedor, con la proporción del documento. */
function marco(ancho: number, alto: number) {
  const w = Math.min(ancho * 0.9, alto * 0.8 * PROPORCION);
  const h = w / PROPORCION;
  return { x: (ancho - w) / 2, y: (alto - h) / 2, w, h };
}

export function Camara({
  abierto,
  titulo,
  onCerrar,
  onCaptura,
}: {
  abierto: boolean;
  titulo: string;
  onCerrar: () => void;
  onCaptura: (blob: Blob) => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const nativa = useRef<HTMLInputElement>(null);
  const archivo = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [previa, setPrevia] = useState<{ url: string; blob: Blob } | null>(null);
  const [enVivo, setEnVivo] = useState(false);
  const [guia, setGuia] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (!abierto) return;
    let flujo: MediaStream | null = null;
    let vivo = true;
    setError("");
    setPrevia(null);
    setEnVivo(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("No se pudo abrir la cámara.");
      return;
    }
    void navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((stream) => {
        if (!vivo) {
          stream.getTracks().forEach((pista) => pista.stop());
          return;
        }
        flujo = stream;
        if (video.current) {
          video.current.srcObject = stream;
          void video.current.play().then(() => setEnVivo(true)).catch(() => setError("No se pudo abrir la cámara."));
        }
      })
      .catch(() => setError("No se pudo abrir la cámara."));
    return () => {
      vivo = false;
      flujo?.getTracks().forEach((pista) => pista.stop());
    };
  }, [abierto]);

  useEffect(() => {
    if (!abierto) return;
    const medir = () => {
      const r = caja.current?.getBoundingClientRect();
      if (r) setGuia(marco(r.width, r.height));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, [abierto, enVivo]);

  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa.url); }, [previa]);

  async function capturar() {
    const elemento = video.current;
    const r = caja.current?.getBoundingClientRect();
    if (!elemento || !r || elemento.videoWidth < 20) return;
    const vw = elemento.videoWidth;
    const vh = elemento.videoHeight;
    const escala = Math.max(r.width / vw, r.height / vh);
    const ox = (r.width - vw * escala) / 2;
    const oy = (r.height - vh * escala) / 2;
    const m = marco(r.width, r.height);
    const holgura = 0.04;
    const sx = Math.max(0, (m.x - m.w * holgura - ox) / escala);
    const sy = Math.max(0, (m.y - m.h * holgura - oy) / escala);
    const sw = Math.min(vw - sx, (m.w * (1 + 2 * holgura)) / escala);
    const sh = Math.min(vh - sy, (m.h * (1 + 2 * holgura)) / escala);
    const reduccion = Math.min(1, LADO_MAXIMO / Math.max(sw, sh));
    const lienzo = document.createElement("canvas");
    lienzo.width = Math.round(sw * reduccion);
    lienzo.height = Math.round(sh * reduccion);
    const ctx = lienzo.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(elemento, sx, sy, sw, sh, 0, 0, lienzo.width, lienzo.height);
    const blob = await jpeg(lienzo);
    setPrevia({ url: URL.createObjectURL(blob), blob });
  }

  async function desdeArchivo(file: File | undefined) {
    if (!file) return;
    try {
      onCaptura(await comprimirArchivo(file));
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo leer la imagen.");
    }
  }

  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 grid grid-rows-[auto_1fr_auto] bg-black text-white" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="truncate text-base font-semibold">{titulo}</p>
        <button type="button" className="h-10 rounded-full px-4 text-sm font-medium hover:bg-white/10" onClick={onCerrar}>Cerrar</button>
      </div>
      <div ref={caja} className="relative min-h-0 overflow-hidden bg-[#111]">
        <video ref={video} className={`absolute inset-0 h-full w-full object-cover ${enVivo && !previa ? "" : "invisible"}`} playsInline muted />
        {previa ? <img src={previa.url} alt={titulo} className="absolute inset-0 h-full w-full object-contain" /> : null}
        {enVivo && !previa && guia.w > 0 ? (
          <div
            className="pointer-events-none absolute rounded-2xl border-[3px] border-white shadow-[0_0_0_200vmax_rgba(0,0,0,.45)]"
            style={{ left: guia.x, top: guia.y, width: guia.w, height: guia.h }}
          />
        ) : null}
        {error ? (
          <div className="absolute inset-x-4 top-1/2 grid -translate-y-1/2 gap-3">
            <p role="alert" className="rounded-xl bg-white px-4 py-3 text-center text-sm font-semibold text-alert">{error}</p>
            <button type="button" className="h-14 rounded-xl bg-white text-base font-semibold text-black" onClick={() => nativa.current?.click()}>Cámara del celular</button>
            <button type="button" className="h-14 rounded-xl border border-white/50 text-base font-semibold" onClick={() => archivo.current?.click()}>Subir archivo</button>
          </div>
        ) : null}
        <input ref={nativa} className="sr-only" type="file" accept="image/*" capture="environment" aria-label="Cámara del celular" tabIndex={-1} onChange={(e) => { void desdeArchivo(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={archivo} className="sr-only" type="file" accept="image/*" aria-label="Subir archivo" tabIndex={-1} onChange={(e) => { void desdeArchivo(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <div className="flex items-center justify-center gap-4 bg-[#0c0f14] px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {previa ? (
          <>
            <button type="button" className="h-12 rounded-full border border-white/40 px-5 text-base" onClick={() => setPrevia(null)}>Repetir</button>
            <button type="button" className="h-12 rounded-full bg-white px-6 text-base font-semibold text-black" onClick={() => onCaptura(previa.blob)}>Usar foto</button>
          </>
        ) : enVivo ? (
          <>
            <button type="button" className="h-12 w-12 rounded-full text-xs text-white/80" onClick={() => archivo.current?.click()}>Archivo</button>
            <button type="button" className="h-[4.5rem] w-[4.5rem] rounded-full border-4 border-white bg-white/25 active:bg-white/60" aria-label="Capturar" onClick={() => void capturar()} />
            <span className="h-12 w-12" aria-hidden />
          </>
        ) : null}
      </div>
    </div>
  );
}
