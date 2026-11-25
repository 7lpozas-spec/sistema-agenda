import { pbkdf2Sync, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const cuentas = [
  ["135cc262-3f65-438d-9ca5-7168a66ee208", "admin@ejemplo.cl", "Ana Prueba Admin", "ADMIN", "LICENCIAS_CLAVE_ADMIN"],
  ["dc7f1da9-35cc-4353-90d1-6e0f43cbdf6e", "operador@ejemplo.cl", "Diego Prueba Operador", "OPERADOR_AGENDA", "LICENCIAS_CLAVE_OPERADOR"],
  ["975a9d63-24c2-4c3f-89ca-38f83df09709", "instructor@ejemplo.cl", "Carla Ficticia Instructora", "INSTRUCTOR", "LICENCIAS_CLAVE_INSTRUCTOR"],
  ["4b6e2a10-7c31-4e5a-9f08-2d6c1b0e8a44", "recepcion@ejemplo.cl", "Marta Prueba Recepción", "RECEPCION", "LICENCIAS_CLAVE_RECEPCION"],
];

function hash(clave) {
  const salt = randomBytes(16);
  const bits = pbkdf2Sync(clave, salt, 100_000, 32, "sha256");
  return `pbkdf2-sha256$100000$${salt.toString("base64")}$${bits.toString("base64")}`;
}

const faltan = cuentas.filter(([, , , , variable]) => !process.env[variable]).map((fila) => fila[4]);
if (faltan.length > 0) {
  console.error(`Faltan variables: ${faltan.join(", ")}. Defínalas en el entorno, no en el repositorio.`);
  process.exit(1);
}

const ahora = new Date().toISOString();
const valores = cuentas.map(([id, email, nombre, rol, variable]) => {
  const clave = process.env[variable];
  if (clave.length < 12) {
    console.error(`${variable} debe tener al menos 12 caracteres.`);
    process.exit(1);
  }
  return `('${id}', '${email}', '${nombre}', '${rol}', '${hash(clave)}', 1, 1, 1, 1, '${ahora}')`;
});

const sql = [
  "DELETE FROM usuarios WHERE email IN ('admin@ejemplo.cl', 'operador@ejemplo.cl', 'instructor@ejemplo.cl', 'recepcion@ejemplo.cl');",
  "INSERT INTO usuarios (id, email, nombre, rol, password_hash, puede_ver_otra_agenda, puede_usar_sobrecupo, puede_capturar_fotos, activo, creado_at) VALUES",
  `${valores.join(",\n")};`,
].join("\n");

const resultado = spawnSync(
  "npx",
  ["wrangler", "d1", "execute", "licencias_recoleta", "--local", "--command", sql],
  { stdio: "inherit" },
);
if (resultado.status !== 0) process.exit(resultado.status ?? 1);
console.log("Cuentas ficticias listas en la D1 local.");
