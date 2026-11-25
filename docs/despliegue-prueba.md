# Despliegue de prueba en Cloudflare

Solo datos ficticios. El script es `npm run deploy:test`. Publica el Worker `agendamiento-licencias-recoleta-test` con una base D1 distinta de cualquier base de producción y un bucket R2 de prueba. Las cuentas y la historia ficticia van en el SQL de `deploy-test`, no en el request. No apunte este entorno a una base con datos reales.

## Qué se necesita

1. Una cuenta de Cloudflare con permiso para crear Workers, D1 y R2.
2. Sesión de Wrangler: `npx wrangler login` (o la variable `CLOUDFLARE_API_TOKEN` con permiso de Workers, D1 y R2).
3. Una base D1 nueva, no la de producción:

   ```bash
   npx wrangler d1 create licencias_recoleta_test
   ```

4. Reemplace en `wrangler.jsonc`, dentro de `env.test.d1_databases[0].database_id`, el id que imprime el comando. El valor `00000000-0000-4000-8000-000000000002` es un marcador: el script se niega a desplegar mientras siga ahí.
5. El bucket de fotos de prueba:

   ```bash
   npx wrangler r2 bucket create licencias-recoleta-fotos-test
   ```

6. Despliegue y migraciones remotas:

   ```bash
   npm run deploy:test
   ```

   El script corre `wrangler deploy --env test` y después `wrangler d1 migrations apply licencias_recoleta_test --remote --env test`.

7. La primera visita a `/api/salud` siembra las cuentas de demostración. Contraseñas en la pantalla de ingreso. Cámbielas si el Worker queda expuesto.

En esta máquina `wrangler whoami` respondió que no hay sesión, así que el despliegue no se ejecutó.
