# Fotos en Google Drive

Drive es el almacenamiento principal de las fotos de documentos. Mientras no esté configurado, cada foto queda en el almacenamiento actual: R2 si el Worker tiene el binding `FOTOS`, o la columna `documentos.contenido` de D1 si no lo tiene (es el caso del entorno de prueba). Con Drive configurado:

- la foto sube a Drive y en D1 solo queda el id del archivo (`drive_file_id`, `en_drive = 1`, `contenido` vacío);
- si Google falla, la foto se guarda localmente y queda en `cola_drive`; el cron la reintenta (hasta 6 por pasada) y la libera de D1 cuando sube;
- la oficina sigue viendo la foto: el Worker la lee de D1, de R2 o de Drive, en ese orden.

Estructura de carpetas:

```
Licencias Recoleta/
  2026-11-25/
    12.345.678-5 Pérez Soto Ana/
      carnet_frente-093012.jpg
      carnet_reverso-093040.jpg
      licencia_frente-093105.jpg
      licencia_reverso-093130.jpg
```

La fecha es la de la cita. Reemplazar una foto sube un archivo nuevo y deja el anterior como no vigente.

## Qué credencial usar con un Gmail personal

**Use OAuth con refresh token (opción A).** Una cuenta de servicio no tiene cuota en "Mi unidad" de un Gmail personal: Google rechaza que suba archivos a una carpeta compartida desde una cuenta personal. Solo sirve con una unidad compartida de Google Workspace (opción B).

| | OAuth + refresh token | Cuenta de servicio |
|---|---|---|
| Gmail personal | Sí | No (sin cuota) |
| Google Workspace | Sí | Sí, con unidad compartida |
| Dueño de los archivos | Su cuenta | La unidad compartida |
| Riesgo de vencimiento | Si la app queda en modo "Prueba", el token vence a los 7 días | No vence |

## A. OAuth con refresh token (recomendado)

Secretos que necesita el Worker:

| Nombre | Qué es |
|---|---|
| `GOOGLE_OAUTH_CLIENT_ID` | ID de cliente OAuth de tipo "Aplicación de escritorio" |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Secreto de ese cliente |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Refresh token de la cuenta dueña de las fotos, alcance `drive.file` |
| `GOOGLE_DRIVE_FOLDER_ID` | Opcional. Déjelo vacío: la app crea `Licencias Recoleta` en Mi unidad |

Pasos:

1. Entre a [Google Cloud Console](https://console.cloud.google.com/) con el Gmail que será dueño de las fotos y cree un proyecto, por ejemplo `licencias-recoleta`.
2. **APIs y servicios → Biblioteca**: active **Google Drive API**.
3. **Pantalla de consentimiento OAuth**: tipo Externo, nombre de la app, su correo como contacto. Alcance: `https://www.googleapis.com/auth/drive.file`. Luego **Publicar app** (estado "En producción"). `drive.file` no es un alcance sensible, así que Google no exige verificación; en estado "Prueba" el refresh token vence a los 7 días.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación de escritorio**. Anote el client id y el client secret.
5. En su computador, abra en el navegador (reemplace `CLIENT_ID`):

   ```
   https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://127.0.0.1&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent
   ```

   Acepte con el mismo Gmail. El navegador irá a `http://127.0.0.1/?code=...` (la página no carga; es normal). Copie el valor de `code`.
6. Cambie el código por el refresh token (en su terminal, no en un chat):

   ```bash
   curl -s https://oauth2.googleapis.com/token \
     -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET \
     -d code=CODE -d redirect_uri=http://127.0.0.1 -d grant_type=authorization_code
   ```

   Guarde el campo `refresh_token`.
7. Cárguelos como secretos del Worker de prueba. Cada comando pide el valor sin mostrarlo:

   ```bash
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID --env test
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --env test
   npx wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN --env test
   ```

   También puede hacerlo en el panel de Cloudflare: Workers → `agendamiento-licencias-recoleta-test` → Configuración → Variables y secretos → Agregar → tipo Secreto.
8. Suba una foto ficticia desde la ficha y confirme que aparece en `Licencias Recoleta/<fecha>/<RUT …>/` de su Drive.

Con `drive.file` la app solo ve lo que ella misma creó. Por eso conviene dejar `GOOGLE_DRIVE_FOLDER_ID` vacío: si apunta a una carpeta creada a mano, Drive responde que no la encuentra. Si quiere moverla, mueva la carpeta `Licencias Recoleta` donde quiera dentro de su Drive: la app guarda su id en memoria solo mientras el Worker está activo y la vuelve a buscar por nombre.

Para revocar el acceso: [myaccount.google.com/permissions](https://myaccount.google.com/permissions) → la app → Quitar acceso.

## B. Cuenta de servicio (solo Google Workspace)

| Nombre | Qué es |
|---|---|
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `client_email` de la cuenta de servicio |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | `private_key` del JSON (PEM; los saltos pueden ir como `\n`) |
| `GOOGLE_DRIVE_FOLDER_ID` | Obligatorio: id de una carpeta dentro de una unidad compartida |

1. Cree la cuenta de servicio en el proyecto y genere una clave JSON (guárdela fuera del repositorio).
2. En la unidad compartida de Workspace, agregue el `client_email` como **Administrador de contenido**.
3. Cargue los tres secretos con `npx wrangler secret put … --env test`.

Si están ambas configuraciones, la app usa OAuth.
