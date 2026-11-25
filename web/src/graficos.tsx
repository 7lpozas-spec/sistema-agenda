interface Punto { etiqueta: string; valor: number }

export function Barras({ puntos, titulo }: { puntos: Punto[]; titulo: string }) {
  const maximo = Math.max(1, ...puntos.map((punto) => punto.valor));
  if (puntos.length === 0) return <p className="text-sm text-muted">Sin datos</p>;
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-semibold">{titulo}</figcaption>
      <div className="grid gap-2" role="img" aria-label={puntos.map((punto) => `${punto.etiqueta}: ${punto.valor}`).join(", ")}>
        {puntos.map((punto) => (
            <div key={punto.etiqueta} className="grid grid-cols-[11rem_1fr_2rem] items-center gap-2 text-sm">
            <span className="truncate">{punto.etiqueta}</span>
            <span className="h-3 overflow-hidden rounded-full bg-paper">
              <span className="block h-3 rounded-full bg-sky" style={{ width: `${(punto.valor / maximo) * 100}%` }} />
            </span>
            <span className="text-right tabular-nums">{punto.valor}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

function sumarDia(iso: string, dias: number): string {
  const [anio, mes, dia] = iso.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1, dia + dias)).toISOString().slice(0, 10);
}

export function Linea({ puntos, desde, hasta, titulo }: { puntos: { fecha: string; citas: number }[]; desde: string; hasta: string; titulo: string }) {
  const mapa = new Map(puntos.map((punto) => [punto.fecha, punto.citas]));
  const serie: { fecha: string; citas: number }[] = [];
  for (let cursor = desde; cursor <= hasta && serie.length < 370; cursor = sumarDia(cursor, 1)) {
    serie.push({ fecha: cursor, citas: mapa.get(cursor) ?? 0 });
  }
  if (serie.length === 0) return <p className="text-sm text-muted">Sin datos</p>;
  const maximo = Math.max(1, ...serie.map((punto) => punto.citas));
  const ancho = 640;
  const alto = 180;
  const paso = serie.length === 1 ? 0 : ancho / (serie.length - 1);
  const coords = serie.map((punto, i) => {
    const x = i * paso;
    const y = alto - 12 - (punto.citas / maximo) * (alto - 28);
    return { x, y };
  });
  return (
    <figure className="grid gap-2">
      <figcaption className="text-sm font-semibold">{titulo}</figcaption>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="h-44 w-full" role="img" aria-label={`Tendencia de ${serie.length} días, máximo ${maximo}`}>
        <polyline fill="none" stroke="#1b4f8a" strokeWidth="3" points={coords.map((punto) => `${punto.x},${punto.y}`).join(" ")} />
        {coords.filter((_, i) => serie[i].citas > 0).map((punto) => (
          <circle key={`${punto.x}-${punto.y}`} cx={punto.x} cy={punto.y} r="4" fill="#1b4f8a" />
        ))}
      </svg>
      <p className="text-xs text-muted">{serie[0].fecha} a {serie.at(-1)?.fecha}</p>
    </figure>
  );
}

const COLORES = ["#1b4f8a", "#1f6b45", "#8a5a00", "#9b2335", "#384048", "#5c6b73", "#7aa2c4", "#8fbfa3"];

export function Dona({ puntos, titulo }: { puntos: Punto[]; titulo: string }) {
  const total = puntos.reduce((suma, punto) => suma + punto.valor, 0);
  if (total === 0) return <p className="text-sm text-muted">Sin datos</p>;
  let cursor = 0;
  const radios = puntos.filter((punto) => punto.valor > 0).map((punto, indice) => {
    const inicio = cursor / total;
    cursor += punto.valor;
    const fin = cursor / total;
    return { ...punto, inicio, fin, color: COLORES[indice % COLORES.length] };
  });
  const arcos = radios.map((punto) => segmento(punto.inicio, punto.fin, punto.color)).join("");
  return (
    <figure className="grid gap-3 sm:grid-cols-[10rem_1fr] sm:items-center">
      <figcaption className="sr-only">{titulo}</figcaption>
      <svg viewBox="0 0 42 42" className="mx-auto h-36 w-36" role="img" aria-label={radios.map((punto) => `${punto.etiqueta} ${punto.valor}`).join(", ")}>
        <circle cx="21" cy="21" r="15.9" fill="none" stroke="#e6ebef" strokeWidth="6" />
        <g dangerouslySetInnerHTML={{ __html: arcos }} />
        <circle cx="21" cy="21" r="10" fill="white" />
      </svg>
      <ul className="grid gap-1 text-sm">
        {radios.map((punto) => (
          <li key={punto.etiqueta} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: punto.color }} />{punto.etiqueta}</span>
            <span className="tabular-nums">{punto.valor}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function segmento(inicio: number, fin: number, color: string): string {
  const largo = Math.max(0.001, (fin - inicio) * 100);
  const hueco = 100 - largo;
  const rotacion = inicio * 360 - 90;
  return `<circle cx="21" cy="21" r="15.9" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="${largo} ${hueco}" transform="rotate(${rotacion} 21 21)" />`;
}

const DIAS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function Calor({ celdas, titulo }: { celdas: { dia: number; hora: string; citas: number }[]; titulo: string }) {
  const base: string[] = [];
  for (let minuto = 8 * 60 + 30; minuto <= 12 * 60; minuto += 30) {
    base.push(`${String(Math.floor(minuto / 60)).padStart(2, "0")}:${String(minuto % 60).padStart(2, "0")}`);
  }
  const horas = [...new Set([...base, ...celdas.map((celda) => celda.hora)])].sort();
  const mapa = new Map(celdas.map((celda) => [`${celda.dia}|${celda.hora}`, celda.citas]));
  const maximo = Math.max(1, ...celdas.map((celda) => celda.citas));
  if (horas.length === 0) return <p className="text-sm text-muted">Sin datos</p>;
  return (
    <figure className="grid gap-2 overflow-x-auto">
      <figcaption className="text-sm font-semibold">{titulo}</figcaption>
      <table className="border-collapse text-center text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1">Hora</th>
            {[1, 2, 3, 4, 5, 6].map((dia) => <th key={dia} className="px-2 py-1">{DIAS[dia]}</th>)}
          </tr>
        </thead>
        <tbody>
          {horas.map((hora) => (
            <tr key={hora}>
              <th scope="row" className="px-2 py-1 text-left">{hora}</th>
              {[1, 2, 3, 4, 5, 6].map((dia) => {
                const valor = mapa.get(`${dia}|${hora}`) ?? 0;
                const tinta = Math.round((valor / maximo) * 180);
                return (
                  <td key={dia} className="px-2 py-1" style={{ background: valor ? `rgba(27, 79, 138, ${0.15 + tinta / 220})` : "#f3f5f7" }} title={`${DIAS[dia]} ${hora}: ${valor}`}>
                    {valor || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
