# Variante de agenda operativa

Rama: `mejora/agenda-operativa`. Base: `47f90df`.

La vista diaria muestra los cupos disponibles aunque el bloque ya tenga personas. Una ficha lateral permite marcar la llegada del día y mover una cita a otro bloque disponible; la ficha completa sigue disponible para documentos, cancelación y cambios de fecha. En pantallas pequeñas, el detalle aparece sobre la lista. Se conservan las vistas semanal y mensual.

## Cambios incluidos

- Búsqueda local por nombre, trámite u hora y filtro por estado. El buscador superior se identifica como navegación por secciones; no se presenta como búsqueda de personas.
- Fecha y vista en la URL. La reserva vuelve a la misma fecha de la agenda.
- Consulta explícita por RUT, recuperación de datos y aviso de citas activas e inasistencias. Al cambiar de RUT se borran los datos de la persona anterior y se descartan respuestas obsoletas.
- Validación de RUT y campos obligatorios, carga/error de horarios, botón de envío bloqueado y clave de idempotencia conservada si se reintenta el mismo contenido.
- Refresco por eventos del servidor, al recuperar el foco y al reconectar. Limpieza del temporizador de reconexión al salir.
- Fallos de carga visibles, con reintento. Una semana incompleta no se muestra como días vacíos. Se descartan respuestas de una navegación anterior.
- Correos sin proveedor configurado registrados como `ERROR`. Un recordatorio solo recibe `recordatorio_enviado_at` cuando el proveedor acepta el envío; un fallo permanece pendiente.

No se incorporan dependencias de producción ni migraciones de base de datos.

## Validación

```bash
npm ci
npm run check
npm run build
npm test
```

Prueba adicional con el servidor local, migraciones y semilla ficticia del README:

```bash
node --env-file=.dev.vars test/e2e/agenda-operativa.mjs
```

Requiere Chromium de Playwright (`npx playwright install chromium`). Puede indicarse otro ejecutable con `CHROMIUM_PATH`. Las capturas se guardan en `test-results/agenda-operativa`, o en `ARTIFACTS_DIR` si está definido. Esta prueba crea una cita ficticia en el entorno indicado: usar solo una base de desarrollo.

El recorrido comprueba reserva mediante formulario, doble clic, envío de clave de idempotencia, búsqueda por RUT, borrado de datos al cambiar de persona, actualización entre dos ventanas, cupos parcialmente ocupados, búsqueda, ficha, ancho móvil y recuperación de un fallo semanal simulado.

## Límites y siguientes mejoras

- La búsqueda de esta variante se limita al día mostrado. No incluye búsqueda global de todas las citas ni lista de espera.
- Los cupos indicados por bloque no equivalen necesariamente a reservas posibles: el tope diario y los trámites que consumen varios bloques continúan siendo validados por el servidor.
- La actualización en vivo no permite reservar sin conexión. El servidor sigue siendo la autoridad sobre cupos y permisos.
- La clave de idempotencia mejora el reintento desde el formulario; no reemplaza una auditoría de atomicidad de todas las operaciones del servidor.
- Un proveedor que acepta un correo no garantiza entrega en la bandeja del destinatario. La tarea de recordatorios conserva su horario, límite por ejecución y mecanismo existentes; no se agregó una cola de reintentos ni confirmaciones de entrega.
- La vista diaria usa selección y cambio explícito de horario en lugar del arrastre desde la tabla anterior.
- No se modificó producción ni se realizó una auditoría exhaustiva de seguridad.

## Resultado de la verificación de esta rama

- Compilación de producción y TypeScript: correctos.
- 23 pruebas unitarias y de integración: correctas.
- Recorrido `agenda-operativa.mjs`: correcto, incluyendo actualización entre dos ventanas y ausencia de desborde horizontal a 390 px.
- Recorrido original `recorrido.mjs`: correcto, incluyendo ingreso por roles, exportación, captura de documento y parámetros.
- Capturas de escritorio y móvil inspeccionadas con datos ficticios.
