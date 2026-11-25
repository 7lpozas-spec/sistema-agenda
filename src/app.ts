import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import {
  documentosRequeridos,
  esAgenda,
  esRol,
  NOMBRE_ROL,
  type AgendaId,
  type EstadoCita,
  type Rol,
  type TipoTramite,
} from "./domain/catalogo";
import { enmascararRut, formatearRut, normalizarRut } from "./domain/rut";
import { bloquesDeTipo } from "./servicios/reservas";
import { evaluarTipo } from "./domain/reglas";
import { puedeBloquear, puedeConfirmarAsistencia, puedeCrearCita, puedeExportar, puedeFotografiar, puedeMarcarResultado, puedeVerAgenda, puedeVerDashboard } from "./domain/permisos";
import { fechaValida, partesEnZona, sumarDias } from "./domain/tiempo";
import { correoValido, limpiarLinea, limpiarParrafo } from "./domain/texto";
import { quitarExif } from "./domain/exif";
import { detectarImagen } from "./domain/imagen";
import { cabecerasDeSeguridad } from "./security/cabeceras";
import { hashContrasena, iteracionesDeEntorno, sha256Hex, tokenUrl, verificarContrasena } from "./security/claves";
import { ErrorApp, esObjeto } from "./http/error";
import { auditar } from "./servicios/auditoria";
import { armarCorreo, despachar, textoDocumentos } from "./servicios/correo";
import { cuposDesdeAhora, diasLaborables, libresPorDia } from "./servicios/disponibilidad";
import { regenerarCupos } from "./servicios/generar";
import { armarEstadisticas, filtroDe, listadoCitas, type Estadisticas } from "./servicios/estadisticas";
import { libroXlsx, reportePdf } from "./exportar/documentos";
import { candado, sala } from "./locks";
import { publicarEnDrive } from "./services/almacen";
type Variables = { usuario: Usuario; csrfHash: string };
interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  activo: number;
  puede_ver_otra_agenda: number;
  puede_usar_sobrecupo: number;
  puede_capturar_fotos: number;
}

const SESION = "lic_sesion";
const CSRF = "lic_csrf";

function ipDe(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "local";
}
function origenValido(request: Request): boolean {
  const origen = request.headers.get("origin");
  if (!origen) return true;
  return origen === new URL(request.url).origin;
}
async function leerJson(request: Request): Promise<Record<string, unknown>> {
  const tipo = request.headers.get("content-type") ?? "";
  if (!tipo.toLowerCase().includes("application/json")) throw new ErrorApp(415, "TIPO_NO_SOPORTADO", "El cuerpo debe ser JSON.");
  let valor: unknown;
  try { valor = await request.json(); } catch { throw new ErrorApp(400, "JSON_INVALIDO", "No se pudo leer el JSON."); }
  if (!esObjeto(valor)) throw new ErrorApp(400, "JSON_INVALIDO", "El cuerpo debe ser un objeto JSON.");
  return valor;
}
function texto(valor: unknown, etiqueta: string, min: number, max: number): string {
  if (typeof valor !== "string") throw new ErrorApp(400, "DATO_INVALIDO", `${etiqueta} debe ser texto.`);
  const limpio = limpiarLinea(valor);
  if (limpio.length < min || limpio.length > max) throw new ErrorApp(400, "DATO_INVALIDO", `${etiqueta} no cumple el largo permitido.`);
  return limpio;
}
async function parametro(db: D1Database, clave: string, defecto = ""): Promise<string> {
  const fila = await db.prepare("SELECT valor FROM parametros WHERE clave = ?").bind(clave).first<{ valor: string }>();
  return fila?.valor ?? defecto;
}
async function tipoPorId(db: D1Database, id: string): Promise<TipoTramite | null> {
  return db.prepare("SELECT * FROM tipos_tramite WHERE id = ?").bind(id).first<TipoTramite>();
}

export function createApp(): Hono<{ Bindings: Env; Variables: Variables }> {
  const app = new Hono<{ Bindings: Env; Variables: Variables }>();
  app.onError((error, c) => {
    if (error instanceof ErrorApp) return c.json({ codigo: error.codigo, mensaje: error.message }, error.status as 400);
    console.log(JSON.stringify({ nivel: "error", evento: "no_controlado", mensaje: error instanceof Error ? error.message : "error" }));
    return c.json({ codigo: "ERROR_INTERNO", mensaje: "No se pudo completar la operación." }, 500);
  });
  app.use("*", async (c, next) => {
    const https = new URL(c.req.url).protocol === "https:";
    for (const [k, v] of Object.entries(cabecerasDeSeguridad(https))) c.header(k, v);
    if (c.req.path.startsWith("/api")) c.header("Cache-Control", "no-store");
    await next();
  });

  const api = new Hono<{ Bindings: Env; Variables: Variables }>();
  api.use("*", async (c, next) => {
    if (!origenValido(c.req.raw)) throw new ErrorApp(403, "ORIGEN", "El origen de la solicitud no corresponde a esta oficina.");
    await next();
  });
  api.get("/salud", (c) => c.json({ ok: true, servicio: "licencias-recoleta", entorno: c.env.APP_ENV }));

  api.post("/auth/login", async (c) => {
    if ((c.env.AUTH_MODE ?? "local") === "access") {
      throw new ErrorApp(401, "ACCESS", "En este entorno el ingreso es por Cloudflare Access.");
    }
    const cuerpo = await leerJson(c.req.raw);
    const email = texto(cuerpo.email, "El correo", 3, 120).toLowerCase();
    const contrasena = typeof cuerpo.contrasena === "string" ? cuerpo.contrasena : "";
    const desde = new Date(Date.now() - 15 * 60_000).toISOString();
    const fallos = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM intentos_login WHERE email = ? AND ok = 0 AND created_at > ?").bind(email, desde).first<{ n: number }>();
    if ((fallos?.n ?? 0) >= 5) throw new ErrorApp(429, "BLOQUEADO", "Demasiados intentos. Espere 15 minutos.");
    const usuario = await c.env.DB.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first<Usuario & { password_hash: string }>();
    const hash = usuario?.password_hash ?? (await hashContrasena("cuenta-inexistente", iteracionesDeEntorno(c.env.PBKDF2_ITERATIONS)));
    const coincide = await verificarContrasena(contrasena, hash);
    await c.env.DB.prepare("INSERT INTO intentos_login (id, email, ip, ok, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), email, ipDe(c.req.raw), coincide && usuario && usuario.activo === 1 ? 1 : 0, new Date().toISOString()).run();
    if (!usuario || !coincide) throw new ErrorApp(401, "CREDENCIALES", "El correo o la contraseña no coinciden.");
    if (usuario.activo !== 1) throw new ErrorApp(403, "INACTIVO", "Esta cuenta está desactivada.");
    const token = tokenUrl();
    const csrf = tokenUrl();
    const expira = new Date(Date.now() + 8 * 3_600_000).toISOString();
    await c.env.DB.prepare("INSERT INTO sesiones (id, usuario_id, token_hash, csrf_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), usuario.id, await sha256Hex(token), await sha256Hex(csrf), expira, new Date().toISOString()).run();
    const seguro = new URL(c.req.url).protocol === "https:";
    const base = { path: "/", sameSite: "Lax" as const, secure: seguro, maxAge: 8 * 3600 };
    setCookie(c, SESION, token, { ...base, httpOnly: true });
    setCookie(c, CSRF, csrf, { ...base, httpOnly: false });
    await auditar(c.env.DB, { usuarioId: usuario.id, accion: "login", entidad: "usuario", entidadId: usuario.id, ip: ipDe(c.req.raw) });
    return c.json({ usuario: publico(usuario) });
  });

  api.use("*", async (c, next) => {
    if (c.req.path === "/api/salud" || c.req.path === "/api/auth/login") {
      await next();
      return;
    }
    const token = getCookie(c, SESION);
    if (!token) throw new ErrorApp(401, "NO_AUTENTICADO", "Debe iniciar sesión.");
    const fila = await c.env.DB.prepare(
      `SELECT u.*, s.csrf_hash, s.expires_at FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id WHERE s.token_hash = ?`,
    ).bind(await sha256Hex(token)).first<Usuario & { csrf_hash: string; expires_at: string; password_hash: string }>();
    if (!fila || fila.expires_at < new Date().toISOString()) throw new ErrorApp(401, "SESION_EXPIRADA", "La sesión expiró. Vuelva a entrar.");
    if (fila.activo !== 1 || !esRol(fila.rol)) throw new ErrorApp(403, "INACTIVO", "Esta cuenta no puede operar.");
    const metodo = c.req.method.toUpperCase();
    if (metodo !== "GET" && metodo !== "HEAD") {
      const header = c.req.header("x-csrf-token") ?? "";
      const cookie = getCookie(c, CSRF) ?? "";
      if (!header || header !== cookie || (await sha256Hex(header)) !== fila.csrf_hash) {
        throw new ErrorApp(403, "CSRF", "La solicitud no trae una credencial de origen válida.");
      }
    }
    c.set("usuario", fila);
    await next();
  });

  api.post("/auth/logout", async (c) => {
    const token = getCookie(c, SESION);
    if (token) await c.env.DB.prepare("DELETE FROM sesiones WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    deleteCookie(c, SESION, { path: "/" });
    deleteCookie(c, CSRF, { path: "/" });
    return c.json({ ok: true });
  });
  api.get("/me", (c) => c.json({ usuario: publico(c.get("usuario")), rolNombre: NOMBRE_ROL[c.get("usuario").rol] }));
  api.get("/auth/yo", async (c) => {
    const direccion = await parametro(c.env.DB, "direccion_atencion");
    return c.json({ usuario: publico(c.get("usuario")), oficina: { direccion, entorno: c.env.APP_ENV, nombre: "Agendamiento Licencias de Conducir" } });
  });

  api.get("/parametros", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración ve los parámetros.");
    const filas = await c.env.DB.prepare("SELECT clave, valor, descripcion FROM parametros ORDER BY clave").all();
    return c.json({ parametros: filas.results });
  });
  api.get("/tipos-tramite", async (c) => {
    const filas = await c.env.DB.prepare("SELECT * FROM tipos_tramite WHERE activo = 1 ORDER BY orden").all<TipoTramite>();
    return c.json({ tipos: filas.results });
  });
  api.patch("/parametros", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración cambia parámetros.");
    const cuerpo = await leerJson(c.req.raw);
    const lista = Array.isArray(cuerpo.cambios) ? cuerpo.cambios : [];
    const cambios = lista.filter(esObjeto).map((item) =>
      c.env.DB.prepare("UPDATE parametros SET valor = ? WHERE clave = ?").bind(String(item.valor ?? ""), String(item.clave ?? "")),
    );
    if (cambios.length > 0) await c.env.DB.batch(cambios);
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "parametros", entidad: "parametro", despues: { cambios: lista.length }, ip: ipDe(c.req.raw) });
    const filas = await c.env.DB.prepare("SELECT clave, valor, descripcion FROM parametros ORDER BY clave").all();
    return c.json({ parametros: filas.results });
  });
  api.patch("/config/tipos-tramite/:id", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración edita el catálogo.");
    const antes = await tipoPorId(c.env.DB, c.req.param("id"));
    if (!antes) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe ese tipo de trámite.");
    const cuerpo = await leerJson(c.req.raw);
    const nombre = cuerpo.nombre === undefined ? antes.nombre : texto(cuerpo.nombre, "El nombre", 3, 120);
    const activo = cuerpo.activo === undefined ? antes.activo : cuerpo.activo ? 1 : 0;
    const agenda = cuerpo.agendaId === undefined ? antes.agenda_id : cuerpo.agendaId === null || cuerpo.agendaId === "" ? null : texto(cuerpo.agendaId, "La agenda", 3, 20);
    const requiere = cuerpo.requiereAgenda === undefined ? antes.requiere_agenda : cuerpo.requiereAgenda ? 1 : 0;
    if (agenda !== null && !esAgenda(String(agenda))) throw new ErrorApp(400, "DATO_INVALIDO", "La agenda no existe.");
    if ((requiere === 1 && !agenda) || (requiere === 0 && agenda)) throw new ErrorApp(400, "DATO_INVALIDO", "Un tipo con hora necesita agenda, y uno sin hora no puede tenerla.");
    await c.env.DB.prepare("UPDATE tipos_tramite SET nombre = ?, activo = ?, agenda_id = ?, requiere_agenda = ? WHERE id = ?")
      .bind(nombre, activo, agenda, requiere, antes.id).run();
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "editar_tipo", entidad: "tipo_tramite", entidadId: antes.id, antes, despues: { nombre, activo }, ip: ipDe(c.req.raw) });
    return c.json({ ok: true });
  });

  api.get("/dashboard", async (c) => {
    const usuario = c.get("usuario");
    if (!puedeVerDashboard(usuario.rol)) throw new ErrorApp(403, "SIN_PERMISO", "Su rol no tiene dashboard.");
    const ahora = new Date();
    const hoy = partesEnZona(ahora, "America/Santiago").fecha;
    const tarjetas = [];
    for (const agenda of ["GENERAL", "PRIMERA_VEZ"] as const) {
      if (!puedeVerAgenda(usuario.rol, agenda)) continue;
      tarjetas.push(await tarjetaAgenda(c.env.DB, agenda, ahora));
    }
    const metricas = await metricasDia(c.env.DB, hoy);
    const porTipo = await c.env.DB.prepare(
      `SELECT t.nombre, t.id, COUNT(c.id) AS citas,
              SUM(CASE WHEN c.estado = 'ASISTIO' OR c.estado = 'ATRASADO' THEN 1 ELSE 0 END) AS asistieron,
              SUM(CASE WHEN c.estado = 'NO_ASISTIO' THEN 1 ELSE 0 END) AS inasistencias
       FROM tipos_tramite t LEFT JOIN citas c ON c.tipo_tramite_id = t.id AND c.fecha = ?
       GROUP BY t.id ORDER BY t.orden`,
    ).bind(hoy).all();
    return c.json({ fecha: hoy, agendas: tarjetas, hoy: metricas, porTipo: porTipo.results, visibles: ["GENERAL", "PRIMERA_VEZ"] });
  });

  api.get("/agendas/:id/proxima-fecha", async (c) => {
    const agenda = exigirAgendaVisible(c.get("usuario"), c.req.param("id"));
    const fila = (await cuposDesdeAhora(c.env.DB, agenda, new Date(), { limite: 1 }))[0] ?? null;
    return c.json({ proxima: fila });
  });

  api.get("/agendas/:id/disponibilidad", async (c) => {
    const agenda = exigirAgendaVisible(c.get("usuario"), c.req.param("id"));
    const mes = c.req.query("mes") ?? partesEnZona(new Date(), "America/Santiago").fecha.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) throw new ErrorApp(400, "DATO_INVALIDO", "El mes debe tener la forma aaaa-mm.");
    const filas = await c.env.DB.prepare(
      `SELECT fecha, capacidad, usados, sobrecupo_tope, sobrecupo_usados FROM cupos_dia
       WHERE agenda_id = ? AND fecha >= ? AND fecha < ? ORDER BY fecha`,
    ).bind(agenda, `${mes}-01`, mesSiguiente(mes)).all();
    const laborables = await diasLaborables(c.env.DB, agenda);
    return c.json({ dias: filas.results, laborables });
  });

  api.get("/agendas/:id/dia/:fecha", async (c) => {
    const agenda = exigirAgendaVisible(c.get("usuario"), c.req.param("id"));
    const fecha = c.req.param("fecha");
    if (!fechaValida(fecha)) throw new ErrorApp(400, "DATO_INVALIDO", "La fecha no es válida.");
    const bloques = await c.env.DB.prepare(
      "SELECT hora, capacidad, usados FROM cupos_bloque WHERE agenda_id = ? AND fecha = ? ORDER BY hora",
    ).bind(agenda, fecha).all();
    const citas = await c.env.DB.prepare(
      `SELECT c.id, c.hora, c.estado, c.es_sobrecupo, c.docs_cargados, c.docs_requeridos, t.nombre AS tramite,
              ci.rut, ci.nombres, ci.apellidos
       FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
       WHERE c.agenda_id = ? AND c.fecha = ? AND c.estado NOT IN ('CANCELADA', 'ANULADA') ORDER BY c.hora`,
    ).bind(agenda, fecha).all<{ rut: string; nombres: string; apellidos: string; hora: string; estado: string; es_sobrecupo: number; docs_cargados: number; docs_requeridos: number; tramite: string; id: string }>();
    const laborables = await diasLaborables(c.env.DB, agenda);
    return c.json({
      bloques: bloques.results,
      laborables,
      citas: citas.results.map((cita) => ({ ...cita, rut: enmascararRut(cita.rut), nombre: `${cita.apellidos}, ${cita.nombres}` })),
    });
  });

  api.get("/ciudadanos", async (c) => {
    if (c.get("usuario").rol === "INSTRUCTOR") throw new ErrorApp(403, "SIN_PERMISO", "Use la lista del día para buscar.");
    const rut = normalizarRut(c.req.query("rut") ?? "");
    if (!rut) throw new ErrorApp(400, "RUT_INVALIDO", "El RUT no es válido. Revise el dígito verificador.");
    const ciudadano = await c.env.DB.prepare("SELECT * FROM ciudadanos WHERE rut = ?").bind(rut).first();
    const citas = ciudadano
      ? await c.env.DB.prepare("SELECT id, agenda_id, fecha, hora, estado, tipo_tramite_id FROM citas WHERE ciudadano_id = ? AND estado = 'AGENDADA'")
        .bind((ciudadano as { id: string }).id).all()
      : { results: [] };
    const inasistencias = ciudadano ? await contarInasistencias(c.env.DB, (ciudadano as { id: string }).id) : 0;
    return c.json({ ciudadano, citasActivas: citas.results, alertaInasistencias: inasistencias >= 2 });
  });

  api.post("/citas", async (c) => {
    const usuario = c.get("usuario");
    const cuerpo = await leerJson(c.req.raw);
    const clave = c.req.header("idempotency-key");
    if (clave) {
      const previa = await c.env.DB.prepare("SELECT estado_http, cuerpo FROM idempotencia WHERE usuario_id = ? AND clave = ?")
        .bind(usuario.id, clave).first<{ estado_http: number; cuerpo: string }>();
      if (previa) return c.json(JSON.parse(previa.cuerpo), previa.estado_http as 200);
    }
    const tipo = await tipoPorId(c.env.DB, texto(cuerpo.tipoTramiteId, "El tipo de trámite", 3, 40));
    if (!tipo || tipo.activo !== 1) throw new ErrorApp(404, "NO_ENCONTRADO", "Ese tipo de trámite no está disponible.");
    const derivacion = evaluarTipo({
      tipo,
      licenciaObtenidaEl: typeof cuerpo.licenciaObtenidaEl === "string" ? cuerpo.licenciaObtenidaEl : null,
      nacionalidad: typeof cuerpo.nacionalidad === "string" ? cuerpo.nacionalidad : null,
    });
    if (derivacion) throw new ErrorApp(422, derivacion.codigo, derivacion.mensaje);
    if (!tipo.agenda_id || !puedeCrearCita(usuario.rol, tipo.agenda_id)) {
      const proximaAjena = tipo.agenda_id ? (await cuposDesdeAhora(c.env.DB, tipo.agenda_id, new Date(), { limite: 1 }))[0] ?? null : null;
      throw new ErrorApp(403, "SIN_PERMISO", `Este trámite se agenda en la ${tipo.agenda_id === "PRIMERA_VEZ" ? "Agenda Primera Vez" : "Agenda General"}. Derívelo al agendador correspondiente.${proximaAjena ? ` Próxima fecha: ${formatearFecha(proximaAjena.fecha)} ${proximaAjena.hora}.` : ""}`);
    }
    const fecha = texto(cuerpo.fecha, "La fecha", 10, 10);
    const hora = texto(cuerpo.hora, "La hora", 5, 5);
    if (!fechaValida(fecha) || !/^\d{2}:\d{2}$/.test(hora)) throw new ErrorApp(400, "DATO_INVALIDO", "La fecha o la hora no es válida.");
    await validarVentana(c.env.DB, tipo.agenda_id, fecha);
    const ciudadano = await guardarCiudadano(c.env.DB, cuerpo);
    const forzar = usuario.rol === "ADMIN" && cuerpo.forzarDuplicado === true;
    const activa = await c.env.DB.prepare("SELECT id, fecha, hora FROM citas WHERE ciudadano_id = ? AND agenda_id = ? AND estado = 'AGENDADA'")
      .bind(ciudadano.id, tipo.agenda_id).first<{ id: string; fecha: string; hora: string }>();
    if (activa && !forzar) {
      throw new ErrorApp(409, "CITA_ACTIVA", `Ya tiene una cita activa el ${formatearFecha(activa.fecha)} a las ${activa.hora}. Puede reagendarla.`);
    }
    const sobrecupo = cuerpo.usarSobrecupo === true;
    if (sobrecupo && usuario.rol !== "ADMIN" && usuario.puede_usar_sobrecupo !== 1) {
      throw new ErrorApp(403, "SIN_PERMISO", "Su cuenta no puede usar sobrecupo.");
    }
    const agenda = await c.env.DB.prepare("SELECT duracion_bloque_min FROM agendas WHERE id = ?").bind(tipo.agenda_id).first<{ duracion_bloque_min: number }>();
    const bloques = bloquesDeTipo(tipo.duracion_slot_min, agenda?.duracion_bloque_min ?? 15);
    const tomado = await candado(c.env, tipo.agenda_id).tomar({
      agendaId: tipo.agenda_id, fecha, hora, cantidad: tipo.cupos_que_consume, bloques, duracionBloque: agenda?.duracion_bloque_min ?? 15, sobrecupo,
    });
    if (!tomado.ok) throw new ErrorApp(409, "SIN_CUPO", `No quedan cupos en el bloque ${hora} del ${formatearFecha(fecha)}.`);
    const id = crypto.randomUUID();
    const ahora = new Date().toISOString();
    const clases = Array.isArray(cuerpo.clases) ? cuerpo.clases.filter((item): item is string => typeof item === "string") : ["B"];
    const observaciones = typeof cuerpo.observaciones === "string" ? limpiarParrafo(cuerpo.observaciones).slice(0, 500) : "";
    try {
      await c.env.DB.prepare(
        `INSERT INTO citas (
          id, agenda_id, ciudadano_id, tipo_tramite_id, clases, fecha, hora, estado, es_sobrecupo, canal,
          declara_domicilio_recoleta, licencia_obtenida_el, nacionalidad, observaciones, docs_requeridos, docs_cargados,
          creado_por, creado_at, actualizado_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AGENDADA', ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      ).bind(
        id, tipo.agenda_id, ciudadano.id, tipo.id, JSON.stringify(clases), fecha, hora, sobrecupo ? 1 : 0,
        "PRESENCIAL",
        cuerpo.declaraDomicilioRecoleta === true ? 1 : 0,
        typeof cuerpo.licenciaObtenidaEl === "string" ? cuerpo.licenciaObtenidaEl : null,
        typeof cuerpo.nacionalidad === "string" ? cuerpo.nacionalidad : null,
        observaciones, documentosRequeridos(tipo).length, usuario.id, ahora, ahora,
      ).run();
    } catch (error) {
      await candado(c.env, tipo.agenda_id).liberar({ agendaId: tipo.agenda_id, fecha, hora, cantidad: tipo.cupos_que_consume, bloques, duracionBloque: agenda?.duracion_bloque_min ?? 15, sobrecupo });
      const mensaje = error instanceof Error ? error.message : "";
      if (mensaje.includes("UNIQUE")) throw new ErrorApp(409, "CITA_ACTIVA", "Ya tiene una cita activa en esa agenda.");
      throw error;
    }
    await c.env.DB.prepare("INSERT INTO cita_historial (id, cita_id, evento, despues, usuario_id, at) VALUES (?, ?, 'CREADA', ?, ?, ?)")
      .bind(crypto.randomUUID(), id, JSON.stringify({ fecha, hora, tipo: tipo.id }), usuario.id, ahora).run();
    await auditar(c.env.DB, { usuarioId: usuario.id, accion: "crear_cita", entidad: "cita", entidadId: id, despues: { fecha, hora, tipo: tipo.nombre }, ip: ipDe(c.req.raw) });
    if (ciudadano.email) {
      const mensaje = await armarCorreo(c.env.DB, "CONFIRMACION", await variablesCorreo(c.env, ciudadano, tipo, fecha, hora), id, ciudadano.email);
      if (mensaje) await despachar(c.env, mensaje);
    }
    const respuesta = { cita: { id, fecha, hora, agendaId: tipo.agenda_id, esSobrecupo: sobrecupo, codigo: id.slice(0, 8).toUpperCase() } };
    if (clave) await c.env.DB.prepare("INSERT INTO idempotencia (clave, usuario_id, estado_http, cuerpo, creado_at) VALUES (?, ?, 201, ?, ?)")
      .bind(clave, usuario.id, JSON.stringify(respuesta), ahora).run();
    const alerta = await contarInasistencias(c.env.DB, ciudadano.id);
    await avisarOficina(c.env, { tipo: "cita", citaId: id });
    return c.json({ ...respuesta, alertaInasistencias: alerta >= 2 }, 201);
  });

  api.get("/citas/:id", async (c) => {
    const cita = await citaCompleta(c.env.DB, c.req.param("id"));
    if (!cita) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe esa cita.");
    if (!puedeVerAgenda(c.get("usuario").rol, cita.agenda_id as AgendaId)) {
      throw new ErrorApp(403, "SIN_PERMISO", "Su rol no puede ver esa agenda.");
    }
    const historial = await c.env.DB.prepare("SELECT evento, antes, despues, at FROM cita_historial WHERE cita_id = ? ORDER BY at").bind(cita.id).all();
    const otras = await c.env.DB.prepare(
      `SELECT c.id, c.fecha, c.hora, c.estado, t.nombre AS tramite
       FROM citas c JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
       WHERE c.ciudadano_id = ? AND c.id != ?
       ORDER BY c.fecha DESC, c.hora DESC LIMIT 8`,
    ).bind(cita.ciudadano_id, cita.id).all();
    const documentos = await c.env.DB.prepare(
      "SELECT id, tipo, bytes, mime, subido_at, vigente, drive_file_id FROM documentos WHERE cita_id = ? ORDER BY subido_at",
    ).bind(cita.id).all();
    return c.json({ cita: { ...cita, rutVisible: formatearRut(cita.rut) }, historial: historial.results, otras: otras.results, documentos: documentos.results });
  });

  api.post("/citas/:id/cancelar", async (c) => cambiarEstadoCita(c, "CANCELADA", true));
  api.post("/citas/:id/anular", async (c) => cambiarEstadoCita(c, "ANULADA", true));

  api.post("/citas/:id/reagendar", async (c) => {
    const usuario = c.get("usuario");
    const cita = await citaCompleta(c.env.DB, c.req.param("id"));
    if (!cita) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe esa cita.");
    if (!puedeCrearCita(usuario.rol, cita.agenda_id as AgendaId)) throw new ErrorApp(403, "SIN_PERMISO", "No puede reagendar esa agenda.");
    if (cita.estado !== "AGENDADA") throw new ErrorApp(409, "ESTADO_INVALIDO", "Solo se reagenda una cita agendada.");
    const cuerpo = await leerJson(c.req.raw);
    const fecha = texto(cuerpo.fecha, "La fecha", 10, 10);
    const hora = texto(cuerpo.hora, "La hora", 5, 5);
    await validarVentana(c.env.DB, cita.agenda_id, fecha);
    const tipo = await tipoPorId(c.env.DB, cita.tipo_tramite_id);
    const agenda = await c.env.DB.prepare("SELECT duracion_bloque_min FROM agendas WHERE id = ?").bind(cita.agenda_id).first<{ duracion_bloque_min: number }>();
    const bloques = bloquesDeTipo(tipo?.duracion_slot_min ?? null, agenda?.duracion_bloque_min ?? 15);
    const cantidad = tipo?.cupos_que_consume ?? 1;
    const movido = await candado(c.env, cita.agenda_id).tomar({
      agendaId: cita.agenda_id, fecha, hora, cantidad, bloques, duracionBloque: agenda?.duracion_bloque_min ?? 15, sobrecupo: cita.es_sobrecupo === 1,
    });
    if (!movido.ok) throw new ErrorApp(409, "SIN_CUPO", "No hay cupo en el horario nuevo. La cita no cambió.");
    await candado(c.env, cita.agenda_id).liberar({
      agendaId: cita.agenda_id, fecha: cita.fecha, hora: cita.hora, cantidad, bloques, duracionBloque: agenda?.duracion_bloque_min ?? 15, sobrecupo: cita.es_sobrecupo === 1,
    });
    const ahora = new Date().toISOString();
    await c.env.DB.prepare("UPDATE citas SET fecha = ?, hora = ?, actualizado_por = ?, actualizado_at = ? WHERE id = ? AND estado = 'AGENDADA'")
      .bind(fecha, hora, usuario.id, ahora, cita.id).run();
    await c.env.DB.prepare("INSERT INTO cita_historial (id, cita_id, evento, antes, despues, usuario_id, at) VALUES (?, ?, 'REAGENDADA', ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), cita.id, JSON.stringify({ fecha: cita.fecha, hora: cita.hora }), JSON.stringify({ fecha, hora }), usuario.id, ahora).run();
    await auditar(c.env.DB, { usuarioId: usuario.id, accion: "reagendar", entidad: "cita", entidadId: cita.id, antes: { fecha: cita.fecha, hora: cita.hora }, despues: { fecha, hora }, ip: ipDe(c.req.raw) });
    if (cita.email) {
      const mensaje = await armarCorreo(c.env.DB, "REAGENDAMIENTO", { ...(await variablesCorreo(c.env, cita, tipo!, fecha, hora)), fecha_anterior: formatearFecha(cita.fecha) }, cita.id, cita.email);
      if (mensaje) await despachar(c.env, mensaje);
    }
    await avisarOficina(c.env, { tipo: "cita", citaId: cita.id });
    return c.json({ ok: true, fecha, hora });
  });

  api.post("/citas/:id/asistencia", async (c) => {
    const usuario = c.get("usuario");
    const cita = await citaCompleta(c.env.DB, c.req.param("id"));
    if (!cita) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe esa cita.");
    if (!puedeConfirmarAsistencia(usuario.rol, cita.agenda_id as AgendaId)) throw new ErrorApp(403, "SIN_PERMISO", "No puede marcar la asistencia de esa agenda.");
    const cuerpo = await leerJson(c.req.raw);
    const estado = texto(cuerpo.estado, "El estado", 3, 20) as EstadoCita;
    const minutos = Number(await parametro(c.env.DB, "minutos_deshacer_asistencia", "15"));
    const ahora = new Date();
    if (estado === "AGENDADA") {
      if (!cita.asistencia_at) throw new ErrorApp(409, "ESTADO_INVALIDO", "Esa cita no tiene una asistencia que deshacer.");
      const limite = new Date(cita.asistencia_at).getTime() + minutos * 60_000;
      if (ahora.getTime() > limite && usuario.rol !== "ADMIN") throw new ErrorApp(403, "FUERA_DE_PLAZO", "Pasaron los 15 minutos. Solo administración puede corregirla.");
    } else if (!["ASISTIO", "ATRASADO", "NO_ASISTIO"].includes(estado)) {
      throw new ErrorApp(400, "DATO_INVALIDO", "La asistencia debe ser asistió, atrasado o no asistió.");
    }
    await c.env.DB.prepare("UPDATE citas SET estado = ?, asistencia_marcada_por = ?, asistencia_at = ?, actualizado_at = ? WHERE id = ?")
      .bind(estado, usuario.id, estado === "AGENDADA" ? null : ahora.toISOString(), ahora.toISOString(), cita.id).run();
    await auditar(c.env.DB, { usuarioId: usuario.id, accion: "asistencia", entidad: "cita", entidadId: cita.id, antes: { estado: cita.estado }, despues: { estado }, ip: ipDe(c.req.raw) });
    await avisarOficina(c.env, { tipo: "cita", citaId: cita.id });
    return c.json({ ok: true });
  });

  api.get("/lista-dia", async (c) => {
    const usuario = c.get("usuario");
    if (usuario.rol !== "ADMIN" && usuario.rol !== "OPERADOR_AGENDA" && usuario.rol !== "INSTRUCTOR") {
      throw new ErrorApp(403, "SIN_PERMISO", "No puede ver la lista del día.");
    }
    const fecha = c.req.query("fecha") ?? partesEnZona(new Date(), "America/Santiago").fecha;
    const agendaFiltro = usuario.rol === "INSTRUCTOR" ? "PRIMERA_VEZ" : "";
    const q = limpiarLinea(c.req.query("q") ?? "");
    const rut = normalizarRut(q);
    const filas = await c.env.DB.prepare(
      `SELECT c.id, c.hora, c.agenda_id, c.estado, c.es_sobrecupo, c.docs_cargados, c.docs_requeridos,
              t.nombre AS tramite, ci.rut, ci.nombres, ci.apellidos
       FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
       WHERE c.fecha = ? AND c.estado NOT IN ('CANCELADA', 'ANULADA')
         AND (? = '' OR c.agenda_id = ?)
         AND (? = '' OR ci.rut = ? OR ci.apellidos LIKE ?)
       ORDER BY c.hora, c.agenda_id`,
    ).bind(fecha, agendaFiltro, agendaFiltro, q, rut ?? "", `%${q.replace(/[\\%_]/g, (s) => `\\${s}`)}%`).all<{
      id: string; hora: string; agenda_id: string; estado: string; es_sobrecupo: number; docs_cargados: number; docs_requeridos: number; tramite: string; rut: string; nombres: string; apellidos: string;
    }>();
    return c.json({
      fecha,
      citas: filas.results.map((cita) => ({ ...cita, rut: enmascararRut(cita.rut), nombre: `${cita.apellidos}, ${cita.nombres}` })),
      contadores: {
        total: filas.results.length,
        confirmadas: filas.results.filter((cita) => cita.estado === "ASISTIO" || cita.estado === "ATRASADO").length,
        pendientes: filas.results.filter((cita) => cita.estado === "AGENDADA").length,
        noAsistieron: filas.results.filter((cita) => cita.estado === "NO_ASISTIO").length,
      },
    });
  });

  api.get("/vivo", async (c) => {
    if (c.req.header("upgrade") !== "websocket") throw new ErrorApp(426, "WEBSOCKET", "La conexión en vivo requiere WebSocket.");
    return sala(c.env).fetch(c.req.raw);
  });

  api.post("/citas/:id/foto", async (c) => subirFoto(c));

  api.get("/documentos/:id/contenido", async (c) => {
    const doc = await c.env.DB.prepare(
      `SELECT d.*, c.fecha, c.agenda_id FROM documentos d JOIN citas c ON c.id = d.cita_id WHERE d.id = ?`,
    ).bind(c.req.param("id")).first<{ id: string; ruta: string; mime: string; fecha: string; agenda_id: string; drive_file_id: string; contenido: ArrayBuffer | null }>();
    if (!doc) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe ese documento.");
    const usuario = c.get("usuario");
    const hoy = partesEnZona(new Date(), "America/Santiago").fecha;
    if (!puedeFotografiar(usuario.rol, doc.agenda_id as AgendaId) && !puedeVerAgenda(usuario.rol, doc.agenda_id as AgendaId)) {
      throw new ErrorApp(403, "SIN_PERMISO", "No puede ver ese documento.");
    }
    if (usuario.rol === "INSTRUCTOR" && doc.fecha !== hoy) throw new ErrorApp(403, "SIN_PERMISO", "Solo puede ver documentos de las citas de hoy.");
    await auditar(c.env.DB, { usuarioId: usuario.id, accion: "leer_documento", entidad: "documento", entidadId: doc.id, ip: ipDe(c.req.raw), userAgent: c.req.header("user-agent") ?? "" });
    const guardado = await leerFotoGuardada(c.env, doc.ruta, doc.contenido ?? null);
    if (!guardado) throw new ErrorApp(404, "PENDIENTE_DRIVE", "El documento está pendiente de sincronizar.");
    return c.body(guardado, 200, { "content-type": doc.mime, "cache-control": "private, no-store" });
  });

  api.get("/export/citas.csv", async (c) => {
    if (!puedeExportar(c.get("usuario").rol)) throw new ErrorApp(403, "SIN_PERMISO", "Su rol no exporta.");
    const desde = c.req.query("desde") ?? "0000-01-01";
    const hasta = c.req.query("hasta") ?? "9999-12-31";
    const agenda = c.req.query("agenda");
    const filas = await c.env.DB.prepare(
      `SELECT c.fecha, c.hora, c.agenda_id, c.estado, c.es_sobrecupo, t.nombre AS tramite, ci.rut, ci.nombres, ci.apellidos
       FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
       WHERE c.fecha >= ? AND c.fecha <= ? AND (? IS NULL OR c.agenda_id = ?)
       ORDER BY c.fecha, c.hora`,
    ).bind(desde, hasta, agenda && esAgenda(agenda) ? agenda : null, agenda ?? null).all<{
      fecha: string; hora: string; agenda_id: string; estado: string; es_sobrecupo: number; tramite: string; rut: string; nombres: string; apellidos: string;
    }>();
    const lineas = ["fecha;hora;agenda;estado;sobrecupo;tramite;rut;nombre"];
    for (const fila of filas.results) {
      lineas.push([formatearFecha(fila.fecha), fila.hora, fila.agenda_id, fila.estado, fila.es_sobrecupo, fila.tramite, formatearRut(fila.rut), `${fila.nombres} ${fila.apellidos}`].join(";"));
    }
    return c.body(`\uFEFF${lineas.join("\n")}`, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=citas.csv" });
  });

  api.post("/config/sobrecupos", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración activa sobrecupo.");
    const cuerpo = await leerJson(c.req.raw);
    const agenda = texto(cuerpo.agendaId, "La agenda", 3, 20);
    if (!esAgenda(agenda)) throw new ErrorApp(400, "DATO_INVALIDO", "La agenda no existe.");
    const desde = texto(cuerpo.fechaDesde, "La fecha inicial", 10, 10);
    const hasta = texto(cuerpo.fechaHasta, "La fecha final", 10, 10);
    const tope = Number(cuerpo.topePorDia);
    const motivo = texto(cuerpo.motivo, "El motivo", 3, 200);
    if (!Number.isInteger(tope) || tope < 1) throw new ErrorApp(400, "DATO_INVALIDO", "El tope diario debe ser un entero mayor que cero.");
    let advertencia: string | null = null;
    if (agenda === "PRIMERA_VEZ") {
      const dia = await c.env.DB.prepare("SELECT capacidad FROM cupos_dia WHERE agenda_id = 'PRIMERA_VEZ' AND fecha = ?").bind(desde).first<{ capacidad: number }>();
      if (dia && tope + dia.capacidad > dia.capacidad) advertencia = "El sobrecupo supera la capacidad derivada del examinador. Confirme que el equipo puede atenderlo.";
    }
    if (advertencia && cuerpo.confirmar !== true) return c.json({ codigo: "CONFIRMAR", mensaje: advertencia, requiereConfirmacion: true }, 409);
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO sobrecupos (id, agenda_id, fecha_desde, fecha_hasta, tope_por_dia, usable_por_agendador, motivo, activo, creado_por, creado_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, 1, ?, ?)`,
    ).bind(id, agenda, desde, hasta, tope, motivo, c.get("usuario").id, new Date().toISOString()).run();
    await c.env.DB.prepare(
      `UPDATE cupos_dia SET sobrecupo_tope = ? WHERE agenda_id = ? AND fecha >= ? AND fecha <= ?`,
    ).bind(tope, agenda, desde, hasta).run();
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "sobrecupo", entidad: "sobrecupo", entidadId: id, despues: { agenda, desde, hasta, tope, motivo }, ip: ipDe(c.req.raw) });
    return c.json({ ok: true, advertencia }, 201);
  });

  api.post("/config/examinadores/ausencia", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración marca la ausencia.");
    const cuerpo = await leerJson(c.req.raw);
    const fecha = texto(cuerpo.fecha, "La fecha", 10, 10);
    const motivo = texto(cuerpo.motivo, "El motivo", 3, 200);
    const examinador = await c.env.DB.prepare("SELECT id FROM examinadores WHERE activo = 1 LIMIT 1").first<{ id: string }>();
    if (!examinador) throw new ErrorApp(409, "SIN_EXAMINADOR", "No hay un examinador activo.");
    await c.env.DB.prepare(
      `INSERT INTO disponibilidad_examinador (id, examinador_id, fecha, estado, motivo) VALUES (?, ?, ?, 'AUSENTE', ?)
       ON CONFLICT(examinador_id, fecha) DO UPDATE SET estado = 'AUSENTE', motivo = excluded.motivo`,
    ).bind(crypto.randomUUID(), examinador.id, fecha, motivo).run();
    await c.env.DB.prepare(
      `UPDATE cupos_dia SET capacidad = usados WHERE agenda_id = 'PRIMERA_VEZ' AND fecha = ?`,
    ).bind(fecha).run();
    await c.env.DB.prepare(
      `UPDATE cupos_bloque SET capacidad = usados WHERE agenda_id = 'PRIMERA_VEZ' AND fecha = ? AND usados < capacidad`,
    ).bind(fecha).run();
    const afectadas = await c.env.DB.prepare(
      `SELECT c.id, c.hora, ci.nombres, ci.apellidos, ci.rut FROM citas c JOIN ciudadanos ci ON ci.id = c.ciudadano_id
       WHERE c.agenda_id = 'PRIMERA_VEZ' AND c.fecha = ? AND c.estado = 'AGENDADA' ORDER BY c.hora`,
    ).bind(fecha).all();
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "ausencia_examinador", entidad: "examinador", entidadId: fecha, despues: { motivo, citas: afectadas.results.length }, ip: ipDe(c.req.raw) });
    return c.json({ citas: afectadas.results });
  });

  api.post("/config/reagendar-bloque", async (c) => {
    if (!puedeCrearCita(c.get("usuario").rol, "PRIMERA_VEZ")) {
      throw new ErrorApp(403, "SIN_PERMISO", "Solo el operador de agenda o administración reagendan en bloque.");
    }
    const cuerpo = await leerJson(c.req.raw);
    const movimientos = Array.isArray(cuerpo.movimientos) ? cuerpo.movimientos : [];
    if (movimientos.length > 2) throw new ErrorApp(400, "DATO_INVALIDO", "Envíe como máximo 2 movimientos por vez.");
    const hechos: string[] = [];
    for (const item of movimientos) {
      if (!esObjeto(item)) continue;
      const cita = await citaCompleta(c.env.DB, String(item.citaId ?? ""));
      if (!cita || cita.estado !== "AGENDADA") continue;
      const fecha = String(item.fecha ?? "");
      const hora = String(item.hora ?? "");
      const tipo = await tipoPorId(c.env.DB, cita.tipo_tramite_id);
      const agenda = await c.env.DB.prepare("SELECT duracion_bloque_min FROM agendas WHERE id = ?").bind(cita.agenda_id).first<{ duracion_bloque_min: number }>();
      const bloques = bloquesDeTipo(tipo?.duracion_slot_min ?? null, agenda?.duracion_bloque_min ?? 30);
      const tomado = await candado(c.env, cita.agenda_id).tomar({
        agendaId: cita.agenda_id, fecha, hora, cantidad: 1, bloques, duracionBloque: agenda?.duracion_bloque_min ?? 30, sobrecupo: false,
      });
      if (!tomado.ok) continue;
      await candado(c.env, cita.agenda_id).liberar({
        agendaId: cita.agenda_id, fecha: cita.fecha, hora: cita.hora, cantidad: 1, bloques, duracionBloque: agenda?.duracion_bloque_min ?? 30, sobrecupo: false,
      });
      await c.env.DB.prepare("UPDATE citas SET fecha = ?, hora = ?, actualizado_at = ? WHERE id = ?").bind(fecha, hora, new Date().toISOString(), cita.id).run();
      if (cita.email && tipo) {
        const mensaje = await armarCorreo(c.env.DB, "REAGENDAMIENTO", { ...(await variablesCorreo(c.env, cita, tipo, fecha, hora)), fecha_anterior: formatearFecha(cita.fecha) }, cita.id, cita.email);
        if (mensaje) await despachar(c.env, mensaje);
      }
      hechos.push(cita.id);
    }
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "reagendar_bloque", entidad: "cita", despues: { citas: hechos.length }, ip: ipDe(c.req.raw) });
    return c.json({ reagendadas: hechos.length });
  });

  api.get("/usuarios", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración ve las cuentas.");
    const filas = await c.env.DB.prepare("SELECT id, email, nombre, rol, activo FROM usuarios ORDER BY nombre").all();
    return c.json({ usuarios: (filas.results as { activo: number }[]).map((fila) => ({ ...fila, activo: fila.activo === 1 })) });
  });
  api.get("/auditoria", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración ve la auditoría.");
    const filas = await c.env.DB.prepare(
      `SELECT a.id, a.accion, a.entidad, a.entidad_id, a.at, u.nombre AS usuario FROM auditoria a
       LEFT JOIN usuarios u ON u.id = a.usuario_id ORDER BY a.at DESC LIMIT 200`,
    ).all();
    return c.json({ eventos: filas.results });
  });

  api.get("/estadisticas", async (c) => {
    if (!puedeVerDashboard(c.get("usuario").rol)) throw new ErrorApp(403, "SIN_PERMISO", "Su rol no tiene estadísticas.");
    const hoy = partesEnZona(new Date(), "America/Santiago").fecha;
    const filtro = filtroDe({ desde: c.req.query("desde"), hasta: c.req.query("hasta"), agenda: c.req.query("agenda"), tipo: c.req.query("tipo") }, hoy);
    return c.json(await armarEstadisticas(c.env.DB, filtro));
  });

  api.get("/export/estadisticas.csv", async (c) => {
    if (!puedeExportar(c.get("usuario").rol)) throw new ErrorApp(403, "SIN_PERMISO", "Su rol no exporta.");
    const filtro = filtroDe(consulta(c), partesEnZona(new Date(), "America/Santiago").fecha);
    const datos = await armarEstadisticas(c.env.DB, filtro);
    const listado = await listadoCitas(c.env.DB, filtro);
    const lineas = [
      "seccion;clave;valor",
      `kpi;citas_hoy;${datos.kpis.hoy}`,
      `kpi;citas_semana;${datos.kpis.semana}`,
      `kpi;citas_mes;${datos.kpis.mes}`,
      `kpi;citas_periodo;${datos.kpis.periodo}`,
      `kpi;asistieron;${datos.kpis.asistieron}`,
      `kpi;no_asistieron;${datos.kpis.noAsistieron}`,
      `kpi;atrasados;${datos.kpis.atrasados}`,
      `kpi;canceladas;${datos.kpis.canceladas}`,
      ...datos.porTipo.map((fila) => `tipo;${fila.nombre};${fila.citas}`),
      ...datos.porOperador.map((fila) => `operador;${fila.nombre};${fila.citas}`),
      ...datos.ocupacion.map((fila) => `ocupacion;${fila.agenda};${fila.porcentaje}`),
      "",
      "fecha;hora;agenda;estado;tramite;rut;nombre;operador",
      ...listado.results.map((fila) => [formatearFecha(fila.fecha), fila.hora, fila.agenda_id, fila.estado, fila.tramite, formatearRut(fila.rut), `${fila.nombres} ${fila.apellidos}`, fila.operador].join(";")),
    ];
    return c.body(`\uFEFF${lineas.join("\n")}`, 200, {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename=estadisticas-${filtro.desde}-${filtro.hasta}.csv`,
    });
  });

  api.get("/export/estadisticas.xlsx", async (c) => {
    if (!puedeExportar(c.get("usuario").rol)) throw new ErrorApp(403, "SIN_PERMISO", "Su rol no exporta.");
    const filtro = filtroDe(consulta(c), partesEnZona(new Date(), "America/Santiago").fecha);
    const datos = await armarEstadisticas(c.env.DB, filtro);
    const listado = await listadoCitas(c.env.DB, filtro);
    const archivo = libroXlsx([
      { nombre: "Indicadores", filas: hojaIndicadores(datos) },
      { nombre: "Por tipo", filas: [["Tipo", "Citas"], ...datos.porTipo.map((fila) => [fila.nombre, String(fila.citas)])] },
      { nombre: "Por operador", filas: [["Operador", "Citas"], ...datos.porOperador.map((fila) => [fila.nombre, String(fila.citas)])] },
      { nombre: "Ocupacion", filas: [["Agenda", "Capacidad", "Usados", "Porcentaje"], ...datos.ocupacion.map((fila) => [fila.agenda, String(fila.capacidad), String(fila.usados), String(fila.porcentaje)])] },
      {
        nombre: "Listado",
        filas: [
          ["Fecha", "Hora", "Agenda", "Estado", "Tramite", "RUT", "Nombre", "Operador"],
          ...listado.results.map((fila) => [formatearFecha(fila.fecha), fila.hora, fila.agenda_id, fila.estado, fila.tramite, formatearRut(fila.rut), `${fila.nombres} ${fila.apellidos}`, fila.operador]),
        ],
      },
    ]);
    return binario(c, archivo, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `estadisticas-${filtro.desde}-${filtro.hasta}.xlsx`);
  });

  api.get("/export/citas.xlsx", async (c) => {
    if (!puedeExportar(c.get("usuario").rol)) throw new ErrorApp(403, "SIN_PERMISO", "Su rol no exporta.");
    const filtro = filtroDe(consulta(c), partesEnZona(new Date(), "America/Santiago").fecha);
    const listado = await listadoCitas(c.env.DB, filtro);
    const archivo = libroXlsx([{
      nombre: "Citas",
      filas: [
        ["Fecha", "Hora", "Agenda", "Estado", "Tramite", "RUT", "Nombre", "Operador"],
        ...listado.results.map((fila) => [formatearFecha(fila.fecha), fila.hora, fila.agenda_id, fila.estado, fila.tramite, formatearRut(fila.rut), `${fila.nombres} ${fila.apellidos}`, fila.operador]),
      ],
    }]);
    return binario(c, archivo, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", `citas-${filtro.desde}-${filtro.hasta}.xlsx`);
  });

  api.get("/export/reporte-diario.pdf", async (c) => {
    if (!puedeExportar(c.get("usuario").rol)) throw new ErrorApp(403, "SIN_PERMISO", "Su rol no exporta.");
    const hoy = partesEnZona(new Date(), "America/Santiago").fecha;
    const fecha = c.req.query("fecha") && fechaValida(c.req.query("fecha") ?? "") ? c.req.query("fecha")! : hoy;
    const filtro = filtroDe({ desde: fecha, hasta: fecha, agenda: c.req.query("agenda"), tipo: c.req.query("tipo") }, hoy);
    const datos = await armarEstadisticas(c.env.DB, filtro);
    const listado = await listadoCitas(c.env.DB, filtro);
    const lineas = [
      `Municipalidad de Recoleta · Licencias de conducir`,
      `Reporte del ${formatearFecha(fecha)}`,
      `Citas del día: ${datos.kpis.periodo} · Asistieron: ${datos.kpis.asistieron} · Atrasos: ${datos.kpis.atrasados}`,
      `Inasistencias: ${datos.kpis.noAsistieron} · Canceladas: ${datos.kpis.canceladas}`,
      "",
      "Hora  Agenda  Estado  Trámite  Persona",
      ...listado.results.map((fila) => `${fila.hora}  ${fila.agenda_id}  ${fila.estado}  ${fila.tramite}  ${fila.nombres} ${fila.apellidos}`),
      "",
      "Datos ficticios de demostración. No imprima información real de personas en este entorno de prueba.",
    ];
    const pdf = reportePdf(`Reporte diario ${formatearFecha(fecha)}`, lineas);
    return binario(c, pdf, "application/pdf", `reporte-${fecha}.pdf`, "inline");
  });

  api.get("/config/horarios", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración ve el horario.");
    const filas = await c.env.DB.prepare(
      "SELECT id, agenda_id, dia_semana, hora_inicio, hora_fin, cupos_por_bloque, cupo_diario FROM horarios_semanales ORDER BY agenda_id, dia_semana",
    ).all();
    return c.json({ horarios: filas.results });
  });

  api.patch("/config/horarios", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración cambia el horario.");
    const cuerpo = await leerJson(c.req.raw);
    const inicio = texto(typeof cuerpo.horaInicio === "string" ? cuerpo.horaInicio.slice(0, 5) : "", "La hora de inicio", 5, 5);
    const fin = texto(typeof cuerpo.horaFin === "string" ? cuerpo.horaFin.slice(0, 5) : "", "La hora de término", 5, 5);
    if (!/^\d{2}:\d{2}$/.test(inicio) || !/^\d{2}:\d{2}$/.test(fin) || inicio >= fin) {
      throw new ErrorApp(400, "DATO_INVALIDO", "El horario debe ir de una hora inicial a una final posterior, con forma HH:MM.");
    }
    const agenda = typeof cuerpo.agendaId === "string" && esAgenda(cuerpo.agendaId) ? cuerpo.agendaId : null;
    const dias = Array.isArray(cuerpo.dias)
      ? [...new Set(cuerpo.dias.filter((dia: unknown): dia is number => Number.isInteger(dia) && (dia as number) >= 1 && (dia as number) <= 7))]
      : [];
    const filtroDia = dias.length > 0 ? ` AND dia_semana IN (${dias.map(() => "?").join(",")})` : "";
    await c.env.DB.prepare(
      `UPDATE horarios_semanales SET hora_inicio = ?, hora_fin = ? WHERE (? IS NULL OR agenda_id = ?)${filtroDia}`,
    ).bind(inicio, fin, agenda, agenda, ...dias).run();
    await c.env.DB.prepare(
      `INSERT INTO parametros (clave, valor, descripcion) VALUES ('cupos_cursor', '0', 'Indice del lote de cupos')
       ON CONFLICT(clave) DO UPDATE SET valor = '0'`,
    ).run();
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "horario", entidad: "horario", despues: { inicio, fin, agenda }, ip: ipDe(c.req.raw) });
    return c.json({ ok: true, horaInicio: inicio, horaFin: fin, cupos: 0 });
  });

  api.post("/import/citas", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración importa.");
    const csv = (await c.req.text()).replace(/^\uFEFF/, "");
    const lineas = csv.split(/\r?\n/).map((linea) => linea.trim()).filter(Boolean);
    if (lineas.length === 0) throw new ErrorApp(400, "DATO_INVALIDO", "El archivo está vacío.");
    const encabezado = lineas[0].toLowerCase();
    const primera = encabezado.includes("rut") ? 1 : 0;
    const pedido = Number(c.req.query("desde"));
    const cursor = Number.isInteger(pedido) && pedido >= primera ? pedido : primera;
    const fin = Math.min(lineas.length, cursor + 2);
    const errores: { linea: number; mensaje: string }[] = [];
    let insertadas = 0;
    for (let i = cursor; i < fin; i += 1) {
      try {
        await insertarFilaImportada(c, c.get("usuario"), partirCsv(lineas[i]));
        insertadas += 1;
      } catch (error) {
        const mensaje = error instanceof ErrorApp ? error.message : "No se pudo insertar la fila.";
        errores.push({ linea: i + 1, mensaje });
      }
    }
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "importar_citas", entidad: "cita", despues: { insertadas, errores: errores.length }, ip: ipDe(c.req.raw) });
    return c.json({ validas: insertadas, insertadas, errores, pendiente: fin < lineas.length, siguiente: fin });
  });

  api.get("/huecos", async (c) => {
    if (!puedeCrearCita(c.get("usuario").rol, "GENERAL") && !puedeVerDashboard(c.get("usuario").rol)) {
      throw new ErrorApp(403, "SIN_PERMISO", "No puede consultar la disponibilidad.");
    }
    const ahora = new Date();
    const desde = c.req.query("desde") && fechaValida(c.req.query("desde") ?? "") ? c.req.query("desde")! : "";
    const dia = c.req.query("dia") && fechaValida(c.req.query("dia") ?? "") ? c.req.query("dia")! : "";
    const manana = c.req.query("manana") === "1";
    const pedida = c.req.query("agenda");
    const agendas = pedida && esAgenda(pedida) ? [pedida] : (["GENERAL", "PRIMERA_VEZ"] as const);
    const salida = [];
    for (const agenda of agendas) {
      if (!puedeVerAgenda(c.get("usuario").rol, agenda)) continue;
      const pedido = Number(c.req.query("limite") ?? 8);
      const limite = Number.isFinite(pedido) ? Math.min(24, Math.max(1, Math.trunc(pedido))) : 8;
      const filas = await cuposDesdeAhora(c.env.DB, agenda, ahora, { desde, dia, soloManana: manana, limite });
      salida.push({ agenda, proxima: filas[0] ?? null, siguientes: filas });
    }
    return c.json({ agendas: salida });
  });

  api.get("/disponibilidad/mes", async (c) => {
    if (!puedeVerDashboard(c.get("usuario").rol)) throw new ErrorApp(403, "SIN_PERMISO", "Su rol no tiene dashboard.");
    const hoy = partesEnZona(new Date(), "America/Santiago").fecha;
    const mes = c.req.query("mes") && /^\d{4}-\d{2}$/.test(c.req.query("mes") ?? "") ? c.req.query("mes")! : hoy.slice(0, 7);
    const [dias, laborables] = await Promise.all([
      libresPorDia(c.env.DB, new Date(), mes),
      diasLaborables(c.env.DB),
    ]);
    return c.json({ mes, dias, laborables });
  });

  api.post("/bloques/bloquear", async (c) => {
    if (!puedeBloquear(c.get("usuario").rol)) throw new ErrorApp(403, "SIN_PERMISO", "No puede bloquear horarios.");
    const cuerpo = await leerJson(c.req.raw);
    const agenda = texto(cuerpo.agendaId, "La agenda", 3, 20);
    const fecha = texto(cuerpo.fecha, "La fecha", 10, 10);
    const hora = texto(cuerpo.hora, "La hora", 5, 5);
    if (!esAgenda(agenda)) throw new ErrorApp(400, "DATO_INVALIDO", "La agenda no existe.");
    await c.env.DB.prepare(
      "UPDATE cupos_bloque SET capacidad = usados WHERE agenda_id = ? AND fecha = ? AND hora = ?",
    ).bind(agenda, fecha, hora).run();
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "bloquear_bloque", entidad: "cupo", despues: { agenda, fecha, hora }, ip: ipDe(c.req.raw) });
    await avisarOficina(c.env, { tipo: "agenda", agendaId: agenda, fecha });
    return c.json({ ok: true });
  });

  api.post("/citas/:id/resultado", async (c) => {
    const usuario = c.get("usuario");
    if (!puedeMarcarResultado(usuario.rol)) throw new ErrorApp(403, "SIN_PERMISO", "No puede registrar el resultado.");
    const cita = await citaCompleta(c.env.DB, c.req.param("id"));
    if (!cita) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe esa cita.");
    if (cita.agenda_id !== "PRIMERA_VEZ") throw new ErrorApp(409, "ESTADO_INVALIDO", "El resultado corresponde al examen de primera vez.");
    const cuerpo = await leerJson(c.req.raw);
    const resultado = texto(cuerpo.resultado, "El resultado", 8, 10);
    if (resultado !== "APROBADO" && resultado !== "REPROBADO") throw new ErrorApp(400, "DATO_INVALIDO", "El resultado debe ser aprobado o reprobado.");
    await c.env.DB.prepare("UPDATE citas SET resultado = ?, actualizado_at = ?, actualizado_por = ? WHERE id = ?")
      .bind(resultado, new Date().toISOString(), usuario.id, cita.id).run();
    await auditar(c.env.DB, { usuarioId: usuario.id, accion: "resultado", entidad: "cita", entidadId: cita.id, despues: { resultado }, ip: ipDe(c.req.raw) });
    await avisarOficina(c.env, { tipo: "cita", citaId: cita.id });
    return c.json({ ok: true, resultado });
  });

  api.post("/config/cupos/generar", async (c) => {
    if (c.get("usuario").rol !== "ADMIN") throw new ErrorApp(403, "SIN_PERMISO", "Solo administración genera cupos.");
    const lote = await regenerarCupos(c.env.DB);
    const cursor = await c.env.DB.prepare("SELECT valor FROM parametros WHERE clave = 'cupos_cursor'").first<{ valor: string }>();
    const pendiente = (cursor?.valor ?? "0") !== "0";
    await auditar(c.env.DB, { usuarioId: c.get("usuario").id, accion: "generar_cupos", entidad: "cupo", despues: { creados: lote, pendiente }, ip: ipDe(c.req.raw) });
    return c.json({ creados: lote, pendiente });
  });

  app.route("/api", api);
  app.notFound(async (c) => {
    if (c.req.path.startsWith("/api")) return c.json({ codigo: "NO_ENCONTRADO", mensaje: "No existe ese recurso." }, 404);
    return c.env.ASSETS.fetch(c.req.raw);
  });
  return app;

  async function cambiarEstadoCita(c: Context<{ Bindings: Env; Variables: Variables }>, estado: "CANCELADA" | "ANULADA", libera: boolean) {
    const usuario = c.get("usuario") as Usuario;
    const cita = await citaCompleta(c.env.DB, c.req.param("id") ?? "");
    if (!cita) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe esa cita.");
    if (!puedeCrearCita(usuario.rol, cita.agenda_id as AgendaId)) throw new ErrorApp(403, "SIN_PERMISO", "No puede modificar esa agenda.");
    const cuerpo = await leerJson(c.req.raw);
    const motivo = texto(cuerpo.motivo, "El motivo", 3, 200);
    if (cita.estado !== "AGENDADA" && cita.estado !== "ATRASADO") throw new ErrorApp(409, "ESTADO_INVALIDO", "Esa cita ya no se puede cambiar.");
    if (libera) {
      const tipo = await tipoPorId(c.env.DB, cita.tipo_tramite_id);
      const agenda = await c.env.DB.prepare("SELECT duracion_bloque_min FROM agendas WHERE id = ?").bind(cita.agenda_id).first<{ duracion_bloque_min: number }>();
      await candado(c.env, cita.agenda_id).liberar({
        agendaId: cita.agenda_id, fecha: cita.fecha, hora: cita.hora, cantidad: tipo?.cupos_que_consume ?? 1,
        bloques: bloquesDeTipo(tipo?.duracion_slot_min ?? null, agenda?.duracion_bloque_min ?? 15),
        duracionBloque: agenda?.duracion_bloque_min ?? 15, sobrecupo: cita.es_sobrecupo === 1,
      });
    }
    await c.env.DB.prepare("UPDATE citas SET estado = ?, motivo_cancelacion = ?, actualizado_at = ?, actualizado_por = ? WHERE id = ?")
      .bind(estado, motivo, new Date().toISOString(), usuario.id, cita.id).run();
    await c.env.DB.prepare("INSERT INTO cita_historial (id, cita_id, evento, antes, despues, usuario_id, at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), cita.id, estado, JSON.stringify({ estado: cita.estado }), JSON.stringify({ estado, motivo }), usuario.id, new Date().toISOString()).run();
    await auditar(c.env.DB, { usuarioId: usuario.id, accion: estado.toLowerCase(), entidad: "cita", entidadId: cita.id, antes: { estado: cita.estado }, despues: { estado, motivo }, ip: ipDe(c.req.raw) });
    if (cita.email) {
      const tipo = await tipoPorId(c.env.DB, cita.tipo_tramite_id);
      const mensaje = await armarCorreo(c.env.DB, "CANCELACION", await variablesCorreo(c.env, cita, tipo!, cita.fecha, cita.hora), cita.id, cita.email);
      if (mensaje) await despachar(c.env, mensaje);
    }
    await avisarOficina(c.env, { tipo: "cita", citaId: cita.id });
    return c.json({ ok: true });
  }

  async function insertarFilaImportada(
    c: Context<{ Bindings: Env; Variables: Variables }>,
    usuario: Usuario,
    columnas: string[],
  ) {
    const [rutRaw, nombres, apellidos, email, tipoId, fecha, hora] = columnas;
    const tipo = await tipoPorId(c.env.DB, (tipoId ?? "").trim());
    if (!tipo || tipo.activo !== 1) throw new ErrorApp(400, "DATO_INVALIDO", "El tipo de trámite no existe.");
    if (!tipo.requiere_agenda || !tipo.agenda_id) {
      throw new ErrorApp(422, "TRAMITE_SIN_AGENDA", "Ese trámite no se agenda.");
    }
    const ciudadano = await guardarCiudadano(c.env.DB, {
      ciudadano: {
        rut: rutRaw ?? "",
        nombres: nombres ?? "",
        apellidos: apellidos ?? "",
        email: email?.trim() ? email.trim() : undefined,
        sinCorreo: !email?.trim(),
      },
    });
    const ahora = new Date().toISOString();
    if (!fecha || !fechaValida(fecha) || !hora || !/^\d{2}:\d{2}$/.test(hora)) {
      throw new ErrorApp(400, "DATO_INVALIDO", "La fecha o la hora no es válida.");
    }
    await validarVentana(c.env.DB, tipo.agenda_id, fecha);
    const agenda = await c.env.DB.prepare("SELECT duracion_bloque_min FROM agendas WHERE id = ?").bind(tipo.agenda_id).first<{ duracion_bloque_min: number }>();
    const bloques = bloquesDeTipo(tipo.duracion_slot_min, agenda?.duracion_bloque_min ?? 15);
    const tomado = await candado(c.env, tipo.agenda_id).tomar({
      agendaId: tipo.agenda_id, fecha, hora, cantidad: tipo.cupos_que_consume, bloques, duracionBloque: agenda?.duracion_bloque_min ?? 15, sobrecupo: false,
    });
    if (!tomado.ok) throw new ErrorApp(409, "SIN_CUPO", `No quedan cupos en el bloque ${hora}.`);
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare(
        `INSERT INTO citas (
          id, agenda_id, ciudadano_id, tipo_tramite_id, clases, fecha, hora, estado, es_sobrecupo, canal,
          declara_domicilio_recoleta, licencia_obtenida_el, nacionalidad, observaciones, docs_requeridos, docs_cargados,
          creado_por, creado_at, actualizado_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'AGENDADA', 0, ?, 0, NULL, NULL, 'Importación', ?, 0, ?, ?, ?)`,
      ).bind(
        id, tipo.agenda_id, ciudadano.id, tipo.id, JSON.stringify(["B"]), fecha, hora,
        "PRESENCIAL",
        documentosRequeridos(tipo).length, usuario.id, ahora, ahora,
      ).run();
    } catch (error) {
      await candado(c.env, tipo.agenda_id).liberar({
        agendaId: tipo.agenda_id, fecha, hora, cantidad: tipo.cupos_que_consume, bloques, duracionBloque: agenda?.duracion_bloque_min ?? 15, sobrecupo: false,
      });
      const mensaje = error instanceof Error ? error.message : "";
      if (mensaje.includes("UNIQUE")) throw new ErrorApp(409, "CITA_ACTIVA", "Ya tiene una cita activa en esa agenda.");
      throw error;
    }
    await c.env.DB.prepare("INSERT INTO cita_historial (id, cita_id, evento, despues, usuario_id, at) VALUES (?, ?, 'CREADA', ?, ?, ?)")
      .bind(crypto.randomUUID(), id, JSON.stringify({ fecha, hora, origen: "importacion" }), usuario.id, ahora).run();
  }

  async function subirFoto(c: Context<{ Bindings: Env; Variables: Variables }>) {
    const usuario = c.get("usuario");
    const cita = await citaCompleta(c.env.DB, c.req.param("id") ?? "");
    if (!cita) throw new ErrorApp(404, "NO_ENCONTRADO", "No existe esa cita.");
    if (!puedeFotografiar(usuario.rol, cita.agenda_id as AgendaId)) {
      throw new ErrorApp(403, "SIN_PERMISO", "No puede cargar documentos de esa cita.");
    }
    const tipoDoc = c.req.query("tipo") ?? "";
    if (!["FOTO_CIUDADANO", "CEDULA", "DOCUMENTO", "CARNET_FRENTE", "CARNET_REVERSO", "LICENCIA_FRENTE", "LICENCIA_REVERSO"].includes(tipoDoc)) {
      throw new ErrorApp(400, "DATO_INVALIDO", "El tipo de documento no es válido.");
    }
    const pagina = Math.max(1, Number(c.req.query("pagina") ?? "1") || 1);
    const bytes = quitarExif(new Uint8Array(await c.req.arrayBuffer()));
    if (bytes.byteLength > 500 * 1024) throw new ErrorApp(413, "FOTO_GRANDE", "La foto debe pesar 500 KB o menos.");
    const mime = detectarImagen(bytes) ?? (bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : null);
    if (!mime) throw new ErrorApp(400, "FOTO_INVALIDA", "La fotografía debe ser JPEG, PNG o WebP.");
    const anio = cita.fecha.slice(0, 4);
    const mes = cita.fecha.slice(5, 7);
    const carpeta = `Licencias-Agendamiento/${anio}/${mes}/${cita.rut.replace("-", "")}_${cita.id}`;
    const nombreArchivo = `${tipoDoc.toLowerCase()}-${pagina}.jpg`;
    const ruta = `${carpeta}/${nombreArchivo}`;
    const multiple = tipoDoc === "DOCUMENTO";
    if (!multiple) {
      await c.env.DB.prepare("UPDATE documentos SET vigente = 0 WHERE cita_id = ? AND tipo = ? AND vigente = 1").bind(cita.id, tipoDoc).run();
    }
    const id = crypto.randomUUID();
    const hash = await sha256Hex(btoa(String.fromCharCode(...bytes.slice(0, 64))));
    const enR2 = await guardarEnR2(c.env, ruta, bytes, mime);
    let driveId: string | null = null;
    try {
      driveId = await publicarEnDrive(c.env, { bytes, mime, nombre: `${carpeta}/${nombreArchivo}` });
    } catch (error) {
      console.log(JSON.stringify({ nivel: "aviso", evento: "drive_respaldo", mensaje: error instanceof Error ? error.message : "drive" }));
    }
    await c.env.DB.prepare(
      `INSERT INTO documentos (id, cita_id, tipo, drive_file_id, drive_folder_id, ruta, mime, bytes, sha256, vigente, dispositivo, subido_at, contenido, pagina)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
    ).bind(id, cita.id, tipoDoc, driveId ?? id, carpeta, ruta, mime, bytes.byteLength, hash, usuario.id, new Date().toISOString(), enR2 ? null : bytes, pagina).run();
    const cargados = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM documentos WHERE cita_id = ? AND vigente = 1").bind(cita.id).first<{ n: number }>();
    await c.env.DB.prepare("UPDATE citas SET docs_cargados = ? WHERE id = ?").bind(cargados?.n ?? 0, cita.id).run();
    await auditar(c.env.DB, { usuarioId: usuario.id, accion: "doc_subido", entidad: "documento", entidadId: id, despues: { tipo: tipoDoc, ruta }, ip: ipDe(c.req.raw) });
    await avisarOficina(c.env, { tipo: "foto", citaId: cita.id, documentoId: id });
    return c.json({ documento: { id, tipo: tipoDoc, bytes: bytes.byteLength, ruta, pagina } }, 201);
  }
}


async function avisarOficina(env: Env, evento: Record<string, unknown>): Promise<void> {
  try {
    await sala(env).emitir({ ...evento, at: new Date().toISOString() });
  } catch {
    /* la sala puede no tener pantallas abiertas */
  }
}

function bucketFotos(env: Env): R2Bucket | null {
  try {
    return env.FOTOS ?? null;
  } catch {
    return null;
  }
}

async function guardarEnR2(env: Env, ruta: string, bytes: Uint8Array, mime: string): Promise<boolean> {
  const bucket = bucketFotos(env);
  if (!bucket) return false;
  await bucket.put(ruta, bytes, { httpMetadata: { contentType: mime } });
  return true;
}

async function leerFotoGuardada(env: Env, ruta: string, contenido: ArrayBuffer | null): Promise<ArrayBuffer | null> {
  const bucket = bucketFotos(env);
  if (bucket) {
    const objeto = await bucket.get(ruta);
    if (objeto) return objeto.arrayBuffer();
  }
  return contenido;
}

function binario(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  datos: Uint8Array,
  tipo: string,
  nombre: string,
  disposicion: "attachment" | "inline" = "attachment",
) {
  const copia = datos.buffer.slice(datos.byteOffset, datos.byteOffset + datos.byteLength) as ArrayBuffer;
  return c.body(copia, 200, {
    "content-type": tipo,
    "content-disposition": `${disposicion}; filename=${nombre}`,
  });
}
function consulta(c: Context<{ Bindings: Env; Variables: Variables }>) {
  return { desde: c.req.query("desde"), hasta: c.req.query("hasta"), agenda: c.req.query("agenda"), tipo: c.req.query("tipo") };
}
function hojaIndicadores(datos: Estadisticas): string[][] {
  return [
    ["Indicador", "Valor"],
    ["Desde", datos.desde],
    ["Hasta", datos.hasta],
    ["Citas de hoy", String(datos.kpis.hoy)],
    ["Citas de la semana", String(datos.kpis.semana)],
    ["Citas del mes", String(datos.kpis.mes)],
    ["Citas del período", String(datos.kpis.periodo)],
    ["Asistieron", String(datos.kpis.asistieron)],
    ["Inasistencias", String(datos.kpis.noAsistieron)],
    ["Atrasos", String(datos.kpis.atrasados)],
    ["Canceladas", String(datos.kpis.canceladas)],
    ["Anuladas", String(datos.kpis.anuladas)],
    ["Aún agendadas", String(datos.kpis.agendadas)],
  ];
}
function partirCsv(linea: string): string[] {
  const columnas: string[] = [];
  let actual = "";
  let comillas = false;
  for (let i = 0; i < linea.length; i += 1) {
    const caracter = linea[i];
    if (caracter === '"') {
      if (comillas && linea[i + 1] === '"') { actual += '"'; i += 1; }
      else comillas = !comillas;
    } else if (caracter === ";" && !comillas) {
      columnas.push(actual.trim());
      actual = "";
    } else actual += caracter;
  }
  columnas.push(actual.trim());
  return columnas;
}
function publico(usuario: Usuario) {
  return {
    id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol, activo: usuario.activo === 1,
    puedeVerOtraAgenda: usuario.puede_ver_otra_agenda === 1, puedeUsarSobrecupo: usuario.puede_usar_sobrecupo === 1,
  };
}
function exigirAgendaVisible(usuario: Usuario, agenda: string): AgendaId {
  if (!esAgenda(agenda) || !puedeVerAgenda(usuario.rol, agenda)) {
    throw new ErrorApp(403, "SIN_PERMISO", "Su rol no puede ver esa agenda.");
  }
  return agenda;
}
function formatearFecha(iso: string): string {
  const [anio, mes, dia] = iso.split("-");
  return `${dia}-${mes}-${anio}`;
}
function mesSiguiente(mes: string): string {
  const [anio, numero] = mes.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, numero, 1));
  return fecha.toISOString().slice(0, 10);
}
async function tarjetaAgenda(db: D1Database, agenda: AgendaId, ahora: Date) {
  const hoy = partesEnZona(ahora, "America/Santiago").fecha;
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finMes = mesSiguiente(hoy.slice(0, 7));
  const libres = await db.prepare(
    "SELECT COALESCE(SUM(capacidad - usados), 0) AS n FROM cupos_dia WHERE agenda_id = ? AND fecha >= ? AND fecha < ?",
  ).bind(agenda, inicioMes, finMes).first<{ n: number }>();
  const prox = (await cuposDesdeAhora(db, agenda, ahora, { limite: 1 }))[0] ?? null;
  const sobrecupo = await db.prepare(
    "SELECT sobrecupo_tope AS tope, sobrecupo_usados AS usados FROM cupos_dia WHERE agenda_id = ? AND fecha = ? AND sobrecupo_tope > 0",
  ).bind(agenda, hoy).first<{ tope: number; usados: number }>();
  return {
    agenda,
    proximaFecha: prox ? { fecha: formatearFecha(prox.fecha), hora: prox.hora } : null,
    cuposLibresMes: libres?.n ?? 0,
    sobrecupo: sobrecupo ? { activo: true, usados: sobrecupo.usados, tope: sobrecupo.tope } : { activo: false },
  };
}
async function metricasDia(db: D1Database, hoy: string) {
  const filas = await db.prepare("SELECT estado, COUNT(*) AS n FROM citas WHERE fecha = ? GROUP BY estado").bind(hoy).all<{ estado: string; n: number }>();
  const mapa = Object.fromEntries(filas.results.map((fila) => [fila.estado, fila.n]));
  const total = filas.results.reduce((suma, fila) => suma + fila.n, 0);
  return {
    citas: total,
    confirmadas: (mapa.ASISTIO ?? 0) + (mapa.ATRASADO ?? 0),
    pendientes: mapa.AGENDADA ?? 0,
    noAsistieron: mapa.NO_ASISTIO ?? 0,
  };
}
async function contarInasistencias(db: D1Database, ciudadanoId: string): Promise<number> {
  const desde = new Date(Date.now() - 183 * 86_400_000).toISOString().slice(0, 10);
  const fila = await db.prepare("SELECT COUNT(*) AS n FROM citas WHERE ciudadano_id = ? AND estado = 'NO_ASISTIO' AND fecha >= ?")
    .bind(ciudadanoId, desde).first<{ n: number }>();
  return fila?.n ?? 0;
}
async function citaCompleta(db: D1Database, id: string) {
  return db.prepare(
    `SELECT c.*, ci.rut, ci.nombres, ci.apellidos, ci.email, ci.telefono, t.nombre AS tramite
     FROM citas c
     JOIN ciudadanos ci ON ci.id = c.ciudadano_id
     JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
     WHERE c.id = ?`,
  ).bind(id).first<{
    id: string; agenda_id: string; ciudadano_id: string; tipo_tramite_id: string; clases: string; fecha: string; hora: string; estado: string;
    es_sobrecupo: number; email: string | null; telefono: string | null; tramite: string; rut: string; nombres: string; apellidos: string; docs_requeridos: number; asistencia_at: string | null;
  }>();
}
async function guardarCiudadano(db: D1Database, cuerpo: Record<string, unknown>) {
  const datos = esObjeto(cuerpo.ciudadano) ? cuerpo.ciudadano : cuerpo;
  const rut = normalizarRut(typeof datos.rut === "string" ? datos.rut : "");
  if (!rut) throw new ErrorApp(400, "RUT_INVALIDO", "El RUT no es válido. Revise el dígito verificador.");
  const sinCorreo = datos.sinCorreo === true;
  const email = sinCorreo ? null : texto(datos.email, "El correo", 5, 120).toLowerCase();
  if (email && !correoValido(email)) throw new ErrorApp(400, "DATO_INVALIDO", "El correo no tiene un formato válido.");
  const telefono = typeof datos.telefono === "string" && datos.telefono.trim() ? datos.telefono.trim() : null;
  if (telefono && !/^\+56\s?9\s?\d{4}\s?\d{4}$/.test(telefono)) throw new ErrorApp(400, "DATO_INVALIDO", "El teléfono debe tener el formato +56 9 XXXX XXXX.");
  const nombres = texto(datos.nombres, "Los nombres", 2, 80);
  const apellidosBrutos = typeof datos.apellidos === "string"
    ? datos.apellidos
    : `${typeof datos.apellidoPaterno === "string" ? datos.apellidoPaterno : ""} ${typeof datos.apellidoMaterno === "string" ? datos.apellidoMaterno : ""}`;
  const apellidos = texto(apellidosBrutos, "Los apellidos", 2, 80);
  const nacimiento = typeof datos.fechaNacimiento === "string" && datos.fechaNacimiento ? datos.fechaNacimiento : null;
  if (nacimiento && !fechaValida(nacimiento)) throw new ErrorApp(400, "DATO_INVALIDO", "La fecha de nacimiento no es válida.");
  const ahora = new Date().toISOString();
  const previo = await db.prepare("SELECT id FROM ciudadanos WHERE rut = ?").bind(rut).first<{ id: string }>();
  if (previo) {
    await db.prepare("UPDATE ciudadanos SET nombres = ?, apellidos = ?, email = ?, sin_correo = ?, telefono = ?, fecha_nacimiento = ?, actualizado_at = ? WHERE id = ?")
      .bind(nombres, apellidos, email, sinCorreo ? 1 : 0, telefono, nacimiento, ahora, previo.id).run();
    return { id: previo.id, email, nombres, apellidos, rut };
  }
  const id = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO ciudadanos (id, rut, nombres, apellidos, email, sin_correo, telefono, fecha_nacimiento, creado_at, actualizado_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(id, rut, nombres, apellidos, email, sinCorreo ? 1 : 0, telefono, nacimiento, ahora, ahora).run();
  return { id, email, nombres, apellidos, rut };
}
async function variablesCorreo(env: Env, persona: { nombres: string; apellidos: string }, tipo: { nombre: string; requiere_carnet: number; requiere_licencia: number }, fecha: string, hora: string) {
  const direccion = (await env.DB.prepare("SELECT valor FROM parametros WHERE clave = 'direccion_atencion'").first<{ valor: string }>())?.valor ?? "";
  const telefono = (await env.DB.prepare("SELECT valor FROM parametros WHERE clave = 'telefono_consultas'").first<{ valor: string }>())?.valor ?? "";
  return {
    nombre: `${persona.nombres} ${persona.apellidos}`,
    fecha: formatearFecha(fecha),
    hora,
    tramite: tipo.nombre,
    agenda: tipo.nombre.startsWith("Primer") ? "Agenda Primera Vez" : "Agenda General",
    documentos: textoDocumentos(tipo),
    direccion,
    telefono,
    logo_url: "/logo-recoleta.jpg",
  };
}
async function validarVentana(db: D1Database, agendaId: string, fecha: string) {
  const agenda = await db.prepare("SELECT ventana_dias, permite_mismo_dia FROM agendas WHERE id = ?").bind(agendaId).first<{ ventana_dias: number; permite_mismo_dia: number }>();
  const hoy = partesEnZona(new Date(), "America/Santiago").fecha;
  if (fecha < hoy) throw new ErrorApp(409, "FECHA_PASADA", "No se puede agendar en el pasado.");
  if (fecha === hoy && !agenda?.permite_mismo_dia) throw new ErrorApp(409, "MISMO_DIA", "Con la configuración actual la cita es desde el día siguiente.");
  if (fecha > sumarDias(hoy, agenda?.ventana_dias ?? 60)) throw new ErrorApp(409, "FUERA_DE_VENTANA", "Esa fecha está fuera de la ventana de agendamiento.");
  const feriado = await db.prepare("SELECT 1 AS n FROM feriados WHERE fecha = ?").bind(fecha).first();
  if (feriado) throw new ErrorApp(409, "FERIADO", "Ese día es feriado y no hay atención.");
}

export async function tareasProgramadas(env: Env, ahora = new Date()): Promise<void> {
  await regenerarCupos(env.DB, ahora);
  const zona = "America/Santiago";
  const partes = partesEnZona(ahora, zona);
  const parametros = await env.DB.prepare(
    "SELECT clave, valor FROM parametros WHERE clave IN ('hora_cierre_automatico', 'hora_recordatorio', 'direccion_atencion')",
  ).all<{ clave: string; valor: string }>();
  const mapa = Object.fromEntries(parametros.results.map((fila) => [fila.clave, fila.valor]));
  const horaCierre = mapa.hora_cierre_automatico ?? "20:00";
  const horaRecordatorio = mapa.hora_recordatorio ?? "10:00";
  if (partes.hora === horaCierre) {
    await env.DB.prepare("UPDATE citas SET estado = 'NO_ASISTIO', actualizado_at = ? WHERE fecha = ? AND estado = 'AGENDADA'")
      .bind(ahora.toISOString(), partes.fecha).run();
  }
  if (partes.hora !== horaRecordatorio) return;
  const citas = await env.DB.prepare(
    `SELECT c.id, c.fecha, c.hora, c.agenda_id, t.nombre AS tramite, t.requiere_carnet, t.requiere_licencia,
            ci.nombres, ci.apellidos, ci.email
     FROM citas c
     JOIN ciudadanos ci ON ci.id = c.ciudadano_id
     JOIN agendas a ON a.id = c.agenda_id
     JOIN tipos_tramite t ON t.id = c.tipo_tramite_id
     WHERE c.estado = 'AGENDADA' AND c.recordatorio_enviado_at IS NULL AND ci.email IS NOT NULL
       AND c.fecha = date(?, '+' || a.recordatorio_dias_antes || ' day')
     LIMIT 8`,
  ).bind(partes.fecha).all<{
    id: string; fecha: string; hora: string; agenda_id: string; tramite: string;
    requiere_carnet: number; requiere_licencia: number; nombres: string; apellidos: string; email: string;
  }>();
  const enviados: string[] = [];
  for (const cita of citas.results) {
    const mensaje = await armarCorreo(env.DB, "RECORDATORIO", {
      nombre: `${cita.nombres} ${cita.apellidos}`, fecha: formatearFecha(cita.fecha), hora: cita.hora, tramite: cita.tramite,
      agenda: cita.agenda_id === "PRIMERA_VEZ" ? "Agenda Primera Vez" : "Agenda General",
      documentos: textoDocumentos(cita), direccion: mapa.direccion_atencion ?? "", telefono: "", logo_url: "/logo-recoleta.jpg",
    }, cita.id, cita.email);
    if (mensaje && await despachar(env, mensaje)) enviados.push(cita.id);
  }
  if (enviados.length > 0) {
    await env.DB.batch(enviados.map((id) =>
      env.DB.prepare("UPDATE citas SET recordatorio_enviado_at = ? WHERE id = ? AND recordatorio_enviado_at IS NULL").bind(ahora.toISOString(), id),
    ));
  }
}
