# Fotos en Google Drive (cuenta personal)

Mientras no haya credenciales, cada foto queda en el bucket R2 `FOTOS`. El computador de la oficina la muestra desde ahí. Cuando configura Drive, la misma subida copia el archivo a una carpeta de su Google Drive y guarda el id del archivo. Si Drive falla, la foto no se pierde: sigue en R2.

Hay dos formas. Use una.

## A. Cuenta personal con OAuth y refresh token

Sirve para un Drive personal, sin cuenta de servicio.

1. Entre a [Google Cloud Console](https://console.cloud.google.com/) con la cuenta de Google que será dueña de las fotos.
2. Cree un proyecto, por ejemplo `licencias-recoleta`.
3. Active la API **Google Drive**.
4. En **APIs y servicios → Pantalla de consentimiento OAuth**, elija Externo (o Interno si es Workspace), agregue el alcance `https://www.googleapis.com/auth/drive.file` y publique la pantalla en modo de prueba.
5. En **Credenciales → Crear credenciales → ID de cliente de OAuth**, elija **Aplicación de escritorio**. Anote el client id y el client secret.
6. En su Drive personal cree la carpeta `Licencias-Agendamiento` y copie el id de la carpeta (el tramo final de la URL `https://drive.google.com/drive/folders/ESTE_ID`).
7. En una máquina de confianza, obtenga un refresh token de esa misma cuenta. Con el cliente de escritorio puede usar el flujo de bucle local:

   ```bash
   # Sustituya CLIENT_ID y CLIENT_SECRET.
   # Abra la URL que imprime el navegador, acepte con la cuenta dueña de la carpeta
   # y copie el parámetro code de la redirección a http://127.0.0.1.
   python3 - << 'PY'
   print("Abra esta URL, acepte y copie el code:")
   print("https://accounts.google.com/o/oauth2/v2/auth?client_id=CLIENT_ID&redirect_uri=http://127.0.0.1&response_type=code&scope=https://www.googleapis.com/auth/drive.file&access_type=offline&prompt=consent")
   PY
   ```

   Cambie el código por un refresh token:

   ```bash
   curl -s https://oauth2.googleapis.com/token \
     -d client_id=CLIENT_ID \
     -d client_secret=CLIENT_SECRET \
     -d code=CODE \
     -d redirect_uri=http://127.0.0.1 \
     -d grant_type=authorization_code
   ```

   Guarde el campo `refresh_token`. No lo commitee.

8. Cargue los secretos en el Worker de prueba (o en `.dev.vars` para local, archivo que no se versiona):

   ```bash
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID --env test
   npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET --env test
   npx wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN --env test
   npx wrangler secret put GOOGLE_DRIVE_FOLDER_ID --env test
   ```

   En local, `.dev.vars`:

   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   GOOGLE_OAUTH_REFRESH_TOKEN=...
   GOOGLE_DRIVE_FOLDER_ID=...
   PHOTO_BACKEND=drive
   ```

9. Reinicie `wrangler dev`. Suba una foto de prueba con una persona ficticia y confirme que aparece en la carpeta.

El alcance `drive.file` solo ve archivos que creó esta aplicación. La carpeta debe haberse creado con la misma cuenta; si Drive rechaza el padre, cree la carpeta con la API una vez o use el alcance `drive` en el paso 4 y en la URL de autorización.

## B. Cuenta de servicio y carpeta compartida desde el Drive personal

1. En el mismo proyecto de Cloud, **Credenciales → Cuenta de servicio**. Cree una, por ejemplo `licencias-fotos`.
2. En la cuenta, **Claves → Agregar clave → JSON**. Guarde el archivo fuera del repositorio.
3. Copie el `client_email` y la `private_key`.
4. En su Drive personal, comparta la carpeta `Licencias-Agendamiento` con ese `client_email` como **Editor**.
5. Secretos:

   ```bash
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_EMAIL --env test
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY --env test
   npx wrangler secret put GOOGLE_DRIVE_FOLDER_ID --env test
   ```

   La clave privada se pega con los saltos de línea reales. Si la guarda en `.dev.vars`, puede usar `\n` dentro de la línea: el código los convierte.

6. `PHOTO_BACKEND=drive` cuando quiera que el modo de servicio sea el destino principal. Sin ese valor, y sin las variables de OAuth, el sistema sigue en R2.

Si están las dos credenciales, se usa primero el refresh token de la cuenta personal.

## Qué no hacer

No suba RUT, nombres ni fotos de personas reales a este entorno de prueba. Las cuentas de demostración y la semilla son ficticias.
