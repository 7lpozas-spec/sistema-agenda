# Despliegue de prueba por la API de Cloudflare

Worker `agendamiento-licencias-recoleta-test`. Base D1 `licencias_recoleta_test`. El id de la base va en el entorno, no en este archivo. Bucket R2 `licencias-recoleta-fotos-test`. Solo datos ficticios: las cuentas son `@ejemplo.cl` y no hay personas de la municipalidad.

El paquete para subir (worker, assets, manifest, metadata, `migrations.sql` y `secrets.test.json`) está en el Agent Store, carpeta `deploy-test`, con una copia de esta guía al lado. Los comandos de abajo se corren desde esa carpeta. `secrets.test.json` no va al repositorio.

| Archivo | Uso |
| --- | --- |
| `worker/worker.js` | Módulo principal del Worker |
| `worker/worker.js.map` | Source map, se sube en el mismo PUT |
| `metadata.json` | Cuerpo `metadata` del PUT del script. Falta reemplazar el JWT de assets |
| `assets/` | Archivos estáticos, tal cual |
| `assets-manifest.json` | Manifest del `assets-upload-session` |
| `migrations.sql` | Esquema, catálogo y tres cuentas ficticias |
| `seed.sql` | Personas, citas y cupos ficticios. Se aplica después del esquema |
| `vaciar.sql` | Borra las tablas antes de reaplicar |
| `secrets.test.json` | Secrets opcionales. Ninguno se sube para que el entorno arranque |

Variables de entorno de los comandos:

```bash
export CLOUDFLARE_API_TOKEN="token con Workers Scripts Write, D1 Write y Workers R2 Storage Write"
export ACCOUNT_ID="id de la cuenta"
export BASE="https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID"
export SCRIPT="agendamiento-licencias-recoleta-test"
```

El token no se commitea. Todos los llamados llevan `-H "Authorization: Bearer $CLOUDFLARE_API_TOKEN"`.

## 1. Fotos sin R2

El binding `FOTOS` no está en `metadata.json`. El bucket de prueba no está habilitado. Sin ese binding el Worker guarda la foto en la columna `documentos.contenido` de D1. Cuando el bucket exista, créelo y agregue este objeto al arreglo `bindings` de `metadata.json`, antes de `ASSETS`:

```json
{ "type": "r2_bucket", "name": "FOTOS", "bucket_name": "licencias-recoleta-fotos-test" }
```

```bash
curl -sS -X POST "$BASE/r2/buckets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"licencias-recoleta-fotos-test"}'
```

## 2. D1, una sentencia por request

`POST /d1/database/{id}/query` ejecuta una sola sentencia. Hay que vaciar la D1 de prueba y reaplicar. El esquema incluye `migrations/0006_sabado.sql`: se atiende de lunes a sábado, 08:30 a 14:00, y ya no existe la atención sin hora. `seed.sql` trae historia ficticia de varias semanas, sábados incluidos, con asistencias, inasistencias, atrasos y cancelaciones. Primero `vaciar.sql`, después `migrations.sql` y al final `seed.sql`. Un segundo pase sobre tablas que ya existen choca con las claves primarias.

```bash
node --input-type=module << 'JS'
import { readFileSync } from "node:fs";
const sql = readFileSync(process.env.SQL ?? "migrations.sql", "utf8");
const sentencias = [];
let actual = "";
let comillas = false;
for (let i = 0; i < sql.length; i += 1) {
  const c = sql[i];
  if (c === "'" && sql[i - 1] !== "\\") comillas = !comillas;
  if (c === ";" && !comillas) {
    const texto = actual.trim();
    if (/[A-Za-z]/.test(texto.replace(/--[^\n]*/g, ""))) sentencias.push(texto);
    actual = "";
  } else actual += c;
}
const id = process.env.D1_DATABASE_ID;
for (const [i, sentencia] of sentencias.entries()) {
  const respuesta = await fetch(`${process.env.BASE}/d1/database/${id}/query`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql: sentencia }),
  });
  const cuerpo = await respuesta.json();
  if (!respuesta.ok || cuerpo.success === false) {
    console.error(i + 1, sentencia.slice(0, 120));
    console.error(JSON.stringify(cuerpo));
    process.exit(1);
  }
  console.log(i + 1, respuesta.status);
}
JS
```

Ese script lee `SQL` (por defecto `migrations.sql`) y `D1_DATABASE_ID`. El orden es `SQL=vaciar.sql`, luego `SQL=migrations.sql` y al final `SQL=seed.sql`. Cada request es `POST $BASE/d1/database/$D1_DATABASE_ID/query` con cuerpo `{ "sql": "<una sentencia>" }`.

Las cuentas de demostración son ficticias (`admin@ejemplo.cl`, `operador@ejemplo.cl`, `instructor@ejemplo.cl`). Las contraseñas no van en el repositorio: defínalas en el entorno y cree los hashes con `node scripts/crear-cuentas-demo.mjs`.

El Worker no siembra datos en el request. `seed.sql` ya trae la historia ficticia y los cupos. El cron publica como máximo un lote de cupos por hora, con `db.batch`, para alargar la ventana sin pasar el límite de subrequests del plan gratis.

## 3. Sesión de assets

El hash de cada archivo es SHA-256 en hexadecimal, recortado a 32 caracteres, de esta cadena y no del binario pelado:

```text
base64(bytes del archivo) + extensión sin el punto
```

`index.html` usa la extensión `html`. Un archivo sin extensión suma la cadena vacía. `size` es el tamaño en bytes. La ruta del manifest empieza con `/`. Eso es lo que ya está en `assets-manifest.json`. Wrangler 4.168, por dentro, usa BLAKE3 sobre la misma cadena; la documentación de Direct Upload y este paquete usan SHA-256.

```bash
curl -sS -X POST "$BASE/workers/scripts/$SCRIPT/assets-upload-session" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @assets-manifest.json
```

La respuesta trae `result.jwt` y `result.buckets`. `buckets` es una lista de listas de hashes que todavía hay que subir. Si `buckets` viene vacío, el JWT de la sesión es el token de cierre y se salta el paso 4.

## 4. Subir los buckets

Para cada grupo de `buckets`, un POST con los archivos en base64. El nombre de cada parte es el hash. El JWT de la sesión va en `Authorization`, no el token de la cuenta.

```bash
curl -sS -X POST "$BASE/workers/assets/upload?base64=true" \
  -H "Authorization: Bearer $JWT_DE_LA_SESION" \
  -F "<hash>=<base64 del archivo>;type=application/javascript"
```

El archivo se busca en `assets/` quitando la barra inicial de la ruta del manifest. La respuesta de cada bucket trae `result.jwt`. El JWT del último bucket es el token de cierre.

Si el payload del JWT de la sesión tiene `wrangler_single_asset_uploads: true`, cada hash se sube solo, en crudo y sin base64:

```bash
curl -sS -X POST "$BASE/workers/assets/upload/$HASH" \
  -H "Authorization: Bearer $JWT_DE_LA_SESION" \
  -H "Content-Type: <mime del archivo>" \
  --data-binary @assets/ruta
```

## 5. Publicar el Worker

En `metadata.json`, reemplace `REPLACE_WITH_ASSETS_JWT` por el token de cierre y el id de D1 por el de la base de prueba. El resto ya está: compatibilidad `2026-11-25`, las vars no secretas, los Durable Objects `AgendaLock` y `CaptureSession`, y el binding `ASSETS`. No hay clave `migrations`: las clases no cambiaron. Si este es el primer PUT del script y Cloudflare rechaza los Durable Objects porque el namespace no existe, agregue solo entonces:

```json
"migrations": { "new_tag": "v1", "steps": [{ "new_sqlite_classes": ["AgendaLock", "CaptureSession"] }] }
```

No repita esa clave en un despliegue siguiente.

```bash
curl -sS -X PUT "$BASE/workers/scripts/$SCRIPT" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -F "metadata=@metadata.json;type=application/json" \
  -F "worker.js=@worker/worker.js;type=application/javascript+module" \
  -F "worker.js.map=@worker/worker.js.map;type=application/source-map"
```

## 6. Cron horario

El cierre de inasistencias y el recordatorio corren en el cron `0 * * * *`. No viaja dentro del metadata.

```bash
curl -sS -X PUT "$BASE/workers/scripts/$SCRIPT/schedules" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '[{"cron":"0 * * * *"}]'
```

## 7. Secrets

No hay que subir ninguno para que el entorno funcione. `secrets.test.json` lista los nombres. `SESSION_SECRET` trae un valor aleatorio de ejemplo y `subir: false`: el Worker no lo lee. Drive y correo quedan en `null` a propósito; un valor inventado no sirve y, si se sube junto con la carpeta, la foto intentaría Google antes de caer a R2.

Cuando existan credenciales reales de la cuenta personal, cada secret es:

```bash
curl -sS -X PUT "$BASE/workers/scripts/$SCRIPT/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"name":"GOOGLE_OAUTH_REFRESH_TOKEN","text":"...","type":"secret_text"}'
```

Los pasos de Google están en `docs/google-drive.md`. Hasta entonces las fotos quedan en el bucket de prueba.

## 8. Dejarlo alcanzable

```bash
curl -sS -X POST "$BASE/workers/scripts/$SCRIPT/subdomain" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"enabled":true}'
```

La URL queda `https://agendamiento-licencias-recoleta-test.<subdominio-de-la-cuenta>.workers.dev`.

Compruebe `GET /api/salud`. Debe responder `{"ok":true,"entorno":"test"}`. Ese primer llamado publica los cupos ficticios. Entre con la cuenta ficticia cuya clave definió fuera del repositorio. No cargue RUT ni fotos de personas reales.
