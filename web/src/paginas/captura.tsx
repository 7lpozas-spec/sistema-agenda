import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Marca } from "../ui";

const TIPOS = [
  ["CARNET_FRENTE", "Carnet, frente"],
  ["CARNET_REVERSO", "Carnet, reverso"],
  ["LICENCIA_FRENTE", "Licencia, frente"],
  ["LICENCIA_REVERSO", "Licencia, reverso"],
] as const;

function dispositivo(): string {
  const clave = "lic_dispositivo";
  const previo = localStorage.getItem(clave);
  if (previo) return previo;
  const creado = crypto.randomUUID();
  localStorage.setItem(clave, creado);
  return creado;
}

async function comprimir(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  const maximo = 1600;
  const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
  const lienzo = document.createElement("canvas");
  lienzo.width = Math.max(1, Math.round(bitmap.width * escala));
  lienzo.height = Math.max(1, Math.round(bitmap.height * escala));
  const ctx = lienzo.getContext("2d");
  if (!ctx) throw new Error("El celular no pudo preparar la foto.");
  ctx.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height);
  bitmap.close();
  let calidad = 0.72;
  let blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));
  while (blob && blob.size > 480 * 1024 && calidad > 0.4) {
    calidad -= 0.1;
    blob = await new Promise<Blob | null>((resolver) => lienzo.toBlob(resolver, "image/jpeg", calidad));
  }
  if (!blob) throw new Error("No se pudo comprimir la foto.");
  return blob;
}

export function CapturaMovil() {
  const { token = "" } = useParams();
  const [nombre, setNombre] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS)[number][0]>("CARNET_FRENTE");
  const [recibidos, setRecibidos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const id = dispositivo();

  useEffect(() => {
    document.title = "Captura de documentos · Recoleta";
    void fetch(`/api/captura/${token}`, { headers: { "x-dispositivo": id } })
      .then(async (respuesta) => {
        const datos = await respuesta.json() as { nombre?: string; mensaje?: string; documentos?: { tipo: string }[] };
        if (!respuesta.ok) throw new Error(datos.mensaje ?? "El enlace no es válido.");
        setNombre(datos.nombre ?? "");
        setRecibidos((datos.documentos ?? []).map((doc) => doc.tipo));
      })
      .catch((falla: unknown) => setError(falla instanceof Error ? falla.message : "No se pudo abrir la captura."));
  }, [id, token]);

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    setError("");
    setAviso("");
    setEnviando(true);
    try {
      const foto = await comprimir(archivo);
      const respuesta = await fetch(`/api/captura/${token}/foto?tipo=${tipo}`, {
        method: "POST",
        headers: { "x-dispositivo": id, "content-type": "image/jpeg" },
        body: foto,
      });
      const datos = await respuesta.json() as { mensaje?: string };
      if (!respuesta.ok) throw new Error(datos.mensaje ?? "No se pudo subir la foto.");
      setRecibidos((prev) => prev.includes(tipo) ? prev : [...prev, tipo]);
      setAviso("Foto recibida. Ya puede verla en el computador de la oficina.");
    } catch (falla) {
      setError(falla instanceof Error ? falla.message : "No se pudo subir la foto.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-md gap-4 px-4 py-6">
      <Marca />
      <h1 className="text-2xl font-semibold">Captura de documentos</h1>
      <p className="text-sm text-muted">{nombre ? `Documentos de ${nombre}. ` : ""}El enlace dura 15 minutos y queda ligado a este celular. La foto se comprime y se envía sin datos de ubicación.</p>
      {error ? <p role="alert" className="rounded-lg border border-alert px-3 py-2 text-sm text-alert">{error}</p> : null}
      {aviso ? <p role="status" className="rounded-lg border border-pine px-3 py-2 text-sm">Foto recibida. Ya puede verla en el computador de la oficina.</p> : null}
      <label className="grid gap-1 text-sm font-semibold">Documento
        <select className="rounded-md border border-line px-3 py-3 text-base" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          {TIPOS.map(([valor, etiqueta]) => <option key={valor} value={valor}>{etiqueta}{recibidos.includes(valor) ? " · listo" : ""}</option>)}
        </select>
      </label>
      <label className="grid gap-2 rounded-xl border border-dashed border-line bg-card p-4 text-sm font-semibold">
        Tomar o elegir foto
        <input
          className="sr-only"
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void subir(e.target.files?.[0])}
        />
        <span className="font-normal text-muted">Abre la cámara del celular o la galería.</span>
      </label>
      <button type="button" className="rounded-md bg-pine px-4 py-3 font-semibold text-white" disabled={enviando} onClick={() => document.querySelector<HTMLInputElement>("input[type=file]")?.click()}>
        {enviando ? "Enviando…" : "Subir foto"}
      </button>
      <ul className="grid gap-1 text-sm">
        {TIPOS.map(([valor, etiqueta]) => (
          <li key={valor}>{recibidos.includes(valor) ? "Listo" : "Pendiente"} · {etiqueta}</li>
        ))}
      </ul>
    </main>
  );
}
