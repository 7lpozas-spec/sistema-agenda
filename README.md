# Licencias de conducir · Municipalidad de Recoleta

Sistema interno para agendar y atender licencias de conducir. Lo usa el personal del departamento. No es un portal para que la persona reserve por internet.

Stack: TypeScript, un Worker con Hono, React y Vite en `web/`, Tailwind, D1, Durable Objects y R2. Las fotos pueden quedar en D1 si no hay bucket.

Hay dos agendas:

- **Agenda general**, para las 3 variantes de Control / Renovación. En el seed: bloques de 15 minutos, 3 cupos por bloque y tope diario de 50.
- **Agenda primera vez**, para los 5 primer otorgamiento, limitada por un examinador (1,5 exámenes por hora, tope diario 10).

Duplicado, canje, regularización y cambio de domicilio no se agendan. El horario de partida es de lunes a sábado, de 08:30 a 14:00. El sábado se edita aparte en Administración → Horario.

El panel de inicio tiene indicadores, gráficos y descarga CSV, Excel y PDF. El calendario tiene mes, semana y día. Los documentos se fotografían desde la ficha de la cita, en el celular o en el PC, con la misma sesión; el resto de los equipos se actualiza en vivo. El comprobante se emite cuando la cita tiene todos sus documentos. Las fotos van a Google Drive; sin credenciales quedan en R2 o en D1 (`docs/google-drive.md`). El despliegue de prueba, con datos ficticios, está en `docs/despliegue-prueba.md` (`npm run deploy:test`).

Los datos de ejemplo son ficticios. No cargue RUT ni fotografías de personas reales en este entorno.

## Cómo correrlo en este equipo

Requiere Node.js 22 o superior.

```bash
npm install
npm run dev
```

Eso aplica las migraciones a la base D1 local, construye la interfaz y deja el servidor en <http://127.0.0.1:43123>.

Si Wrangler pregunta antes de migrar, confirme. No use `--remote` ni `wrangler deploy` hasta tener una base propia.

Copie `.dev.vars.example` a `.dev.vars` y defina ahí las claves de las cuentas ficticias. Ese archivo no se versiona. Después:

```bash
node scripts/crear-cuentas-demo.mjs
npx wrangler d1 execute licencias_recoleta --local --file seed/semilla.sql
```

Los correos de demostración son `admin@ejemplo.cl`, `operador@ejemplo.cl`, `instructor@ejemplo.cl` y `recepcion@ejemplo.cl`. Las contraseñas quedan solo en `.dev.vars`.

El operador de agenda reserva en General y en Primera Vez, y marca la asistencia del mesón. El instructor solo ve la agenda de primera vez: asistencia y resultado del examen. No hay un operador de atención aparte, porque esa tarea es del mismo mesón.

## Pruebas

```bash
npm test
```

Eso corre las pruebas unitarias, con cobertura de las reglas de dominio y de seguridad, y las de integración sobre Miniflare, incluida la de 50 reservas simultáneas al último cupo.

Con el servidor local ya levantado, y las mismas claves de `.dev.vars` exportadas en el entorno:

```bash
npm run test:e2e
```

Recorre ingreso, dashboard, agenda, reserva y parámetros. Las claves no están en el código.

## Qué hay en el proyecto

- `src/` — Worker con la API, las reglas y el acceso a D1.
- `web/` — interfaz en español.
- `migrations/` — esquema D1 y datos de referencia.
- `seed/semilla.sql` — personas, citas y cupos ficticios. No se ejecuta en cada request. En una base local vacía: `npx wrangler d1 execute licencias_recoleta --local --file seed/semilla.sql`.
- `test/unit` — reglas, RUT, cupos, contraseñas y la carrera de 50 hilos contra SQLite.
- `test/integration` — la API completa, permisos, CSRF y la misma carrera contra D1.
- `docs/decisiones-seccion-19.md` — valores de partida y lo que el dueño todavía debe confirmar.

La reserva del cupo es un `UPDATE` condicionado: solo avanza si `reservados < capacidad`. La tabla además rechaza un número de reservas mayor que la capacidad. Cincuenta intentos a la vez dejan una sola cita.

## Fotos y Google Drive

Cada trámite pide carnet (frente y reverso) y, si corresponde, licencia (frente y reverso). La ficha muestra qué falta, abre la cámara trasera, comprime la foto en el navegador (≤ 480 KB), la sube y pasa al siguiente documento. Si la red falla, la subida se reintenta al volver la conexión.

Drive es el almacenamiento principal. Credenciales, pasos y la razón para usar OAuth con un Gmail personal: `docs/google-drive.md`. Sin Drive, la foto queda en R2 (binding `FOTOS`) o en D1; con Drive configurado y caído, queda local y el cron la sube después.

## Comprobante

`GET /api/citas/:id/comprobante.pdf` responde `409 DOCUMENTOS_PENDIENTES` con la lista de faltantes si la cita no tiene todos sus documentos. Excepción: citas canceladas o anuladas, porque el PDF sirve de constancia. El sobrecupo sigue la regla normal. La regla está en `src/servicios/documentos.ts` (`comprobanteDisponible`).

## Listo para desplegar, sin desplegar

`wrangler.jsonc` define el Worker, los archivos estáticos de la interfaz, D1 y R2. Observabilidad de registros y trazas queda encendida. La fecha de compatibilidad es 2026-11-25.

Workers con activos estáticos es la forma actual de publicar lo que antes se separaba en Cloudflare Pages (la interfaz) y un Worker (la API). Un solo `wrangler deploy` haría las dos cosas. No se ejecutó, ni se creó la base remota.

Antes de un despliegue aprobado:

1. Crear la base D1 y el bucket R2 en la cuenta de la municipalidad y reemplazar `database_id`.
2. `npx wrangler d1 migrations apply licencias_recoleta --remote`
3. Cargar los secretos de Drive (`docs/google-drive.md`) y fijar `APP_ENV=production` y `AUTO_SEED=false`.
4. Cambiar las contraseñas. La semilla no corre cuando el entorno es `production`.
5. `npm run build` y después `npx wrangler deploy`

## Seguridad que ya está en el código

- Contraseñas con PBKDF2-SHA256 y sal aleatoria. La sesión guarda solo el hash del token.
- Cookie de sesión `HttpOnly`, `SameSite=Lax` y `Secure` cuando la conexión es HTTPS.
- CSRF de doble envío en toda escritura, más comprobación del origen.
- Cada ruta exige el rol que le corresponde.
- Consultas con parámetros. Los textos se limpian y React no interpreta HTML.
- Cabeceras de seguridad y una política de contenido que solo permite recursos del mismo origen.
- La fotografía se acepta por sus bytes reales, no por el nombre del archivo.
- La auditoría no guarda contraseñas, tokens ni la imagen.
