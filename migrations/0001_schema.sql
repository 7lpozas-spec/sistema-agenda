-- Esquema alineado con la sección 12 de la especificación.
-- Las marcas de tiempo van en UTC. fecha y hora de la cita van en hora de Chile.

CREATE TABLE agendas (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  color TEXT NOT NULL,
  duracion_bloque_min INTEGER NOT NULL,
  ventana_dias INTEGER NOT NULL DEFAULT 60,
  permite_mismo_dia INTEGER NOT NULL DEFAULT 0,
  recordatorio_dias_antes INTEGER NOT NULL DEFAULT 1,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE horarios_semanales (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL,
  dia_semana INTEGER NOT NULL,
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
  cupos_por_bloque INTEGER NOT NULL,
  cupo_diario INTEGER NOT NULL,
  vigente_desde TEXT,
  vigente_hasta TEXT
);

CREATE TABLE excepciones_dia (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  tipo TEXT NOT NULL,
  hora_inicio TEXT,
  hora_fin TEXT,
  cupos_por_bloque INTEGER,
  cupo_diario INTEGER,
  motivo TEXT NOT NULL,
  creado_por TEXT,
  creado_at TEXT NOT NULL
);

CREATE TABLE feriados (
  fecha TEXT PRIMARY KEY,
  nombre TEXT NOT NULL
);

CREATE TABLE sobrecupos (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL,
  fecha_desde TEXT NOT NULL,
  fecha_hasta TEXT NOT NULL,
  tope_por_dia INTEGER NOT NULL,
  usable_por_agendador INTEGER NOT NULL DEFAULT 1,
  motivo TEXT NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_por TEXT NOT NULL,
  creado_at TEXT NOT NULL
);

CREATE TABLE examinadores (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  examenes_por_hora REAL NOT NULL DEFAULT 1.5,
  activo INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE disponibilidad_examinador (
  id TEXT PRIMARY KEY,
  examinador_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  estado TEXT NOT NULL,
  hora_inicio TEXT,
  hora_fin TEXT,
  motivo TEXT,
  UNIQUE (examinador_id, fecha)
);

CREATE TABLE cupos_dia (
  agenda_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  capacidad INTEGER NOT NULL,
  usados INTEGER NOT NULL DEFAULT 0,
  sobrecupo_tope INTEGER NOT NULL DEFAULT 0,
  sobrecupo_usados INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agenda_id, fecha),
  CHECK (usados >= 0 AND usados <= capacidad),
  CHECK (sobrecupo_usados >= 0 AND sobrecupo_usados <= sobrecupo_tope)
);

CREATE TABLE cupos_bloque (
  agenda_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  capacidad INTEGER NOT NULL,
  usados INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (agenda_id, fecha, hora),
  CHECK (usados >= 0 AND usados <= capacidad)
);

CREATE TABLE tipos_tramite (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  requiere_agenda INTEGER NOT NULL DEFAULT 1,
  agenda_id TEXT,
  duracion_slot_min INTEGER,
  cupos_que_consume INTEGER NOT NULL DEFAULT 1,
  examen_teorico INTEGER NOT NULL DEFAULT 0,
  examen_practico INTEGER NOT NULL DEFAULT 0,
  requiere_carnet INTEGER NOT NULL DEFAULT 1,
  requiere_licencia INTEGER NOT NULL DEFAULT 0,
  mapeo_confirmado INTEGER NOT NULL DEFAULT 0,
  nacionalidades_canje TEXT,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL,
  CHECK ((requiere_agenda = 1 AND agenda_id IS NOT NULL) OR (requiere_agenda = 0 AND agenda_id IS NULL))
);

CREATE TABLE clases_licencia (
  codigo TEXT PRIMARY KEY,
  nombre TEXT NOT NULL,
  activa INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE ciudadanos (
  id TEXT PRIMARY KEY,
  rut TEXT NOT NULL UNIQUE,
  nombres TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  email TEXT,
  sin_correo INTEGER NOT NULL DEFAULT 0,
  telefono TEXT,
  fecha_nacimiento TEXT,
  creado_at TEXT NOT NULL,
  actualizado_at TEXT NOT NULL
);

CREATE TABLE citas (
  id TEXT PRIMARY KEY,
  agenda_id TEXT NOT NULL,
  ciudadano_id TEXT NOT NULL,
  tipo_tramite_id TEXT NOT NULL,
  clases TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora TEXT NOT NULL,
  estado TEXT NOT NULL,
  es_sobrecupo INTEGER NOT NULL DEFAULT 0,
  canal TEXT,
  declara_domicilio_recoleta INTEGER NOT NULL DEFAULT 0,
  licencia_obtenida_el TEXT,
  nacionalidad TEXT,
  observaciones TEXT,
  docs_requeridos INTEGER NOT NULL,
  docs_cargados INTEGER NOT NULL DEFAULT 0,
  recordatorio_enviado_at TEXT,
  asistencia_marcada_por TEXT,
  asistencia_at TEXT,
  motivo_cancelacion TEXT,
  creado_por TEXT NOT NULL,
  creado_at TEXT NOT NULL,
  actualizado_por TEXT,
  actualizado_at TEXT
);

CREATE UNIQUE INDEX ux_cita_activa_rut_agenda ON citas (ciudadano_id, agenda_id)
  WHERE estado = 'AGENDADA';
CREATE INDEX ix_citas_fecha ON citas (agenda_id, fecha, hora);

CREATE TABLE atenciones_sin_hora (
  id TEXT PRIMARY KEY,
  ciudadano_id TEXT NOT NULL,
  tipo_tramite_id TEXT NOT NULL,
  fecha TEXT NOT NULL,
  hora_llegada TEXT NOT NULL,
  registrado_por TEXT NOT NULL,
  registrado_at TEXT NOT NULL,
  observaciones TEXT
);

CREATE TABLE cita_historial (
  id TEXT PRIMARY KEY,
  cita_id TEXT NOT NULL,
  evento TEXT NOT NULL,
  antes TEXT,
  despues TEXT,
  usuario_id TEXT,
  at TEXT NOT NULL
);

CREATE TABLE documentos (
  id TEXT PRIMARY KEY,
  cita_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,
  drive_folder_id TEXT NOT NULL,
  ruta TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  vigente INTEGER NOT NULL DEFAULT 1,
  subido_por TEXT,
  dispositivo TEXT,
  subido_at TEXT NOT NULL
);

CREATE TABLE sesiones_captura (
  token_hash TEXT PRIMARY KEY,
  cita_id TEXT NOT NULL,
  codigo_corto TEXT NOT NULL,
  creada_por TEXT NOT NULL,
  expira_at TEXT NOT NULL,
  usada_por_dispositivo TEXT,
  cerrada_at TEXT
);

CREATE TABLE usuarios (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  puede_ver_otra_agenda INTEGER NOT NULL DEFAULT 1,
  puede_usar_sobrecupo INTEGER NOT NULL DEFAULT 1,
  puede_capturar_fotos INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  creado_at TEXT NOT NULL,
  ultimo_acceso_at TEXT
);

CREATE TABLE sesiones (
  id TEXT PRIMARY KEY,
  usuario_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE intentos_login (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  ip TEXT NOT NULL,
  ok INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE plantillas_correo (
  id TEXT PRIMARY KEY,
  asunto TEXT NOT NULL,
  html TEXT NOT NULL,
  texto TEXT NOT NULL,
  actualizado_por TEXT,
  actualizado_at TEXT
);

CREATE TABLE correos_log (
  id TEXT PRIMARY KEY,
  cita_id TEXT,
  tipo TEXT NOT NULL,
  destinatario TEXT NOT NULL,
  estado TEXT NOT NULL,
  proveedor_id TEXT,
  error TEXT,
  intentos INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL
);

CREATE TABLE auditoria (
  id TEXT PRIMARY KEY,
  usuario_id TEXT,
  accion TEXT NOT NULL,
  entidad TEXT NOT NULL,
  entidad_id TEXT,
  antes TEXT,
  despues TEXT,
  ip TEXT,
  user_agent TEXT,
  at TEXT NOT NULL
);

CREATE TABLE parametros (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL,
  descripcion TEXT NOT NULL
);

CREATE TABLE idempotencia (
  clave TEXT NOT NULL,
  usuario_id TEXT NOT NULL,
  estado_http INTEGER NOT NULL,
  cuerpo TEXT NOT NULL,
  creado_at TEXT NOT NULL,
  PRIMARY KEY (usuario_id, clave)
);

CREATE TABLE cola_drive (
  id TEXT PRIMARY KEY,
  documento_id TEXT NOT NULL,
  intentos INTEGER NOT NULL DEFAULT 0,
  ultimo_error TEXT,
  creado_at TEXT NOT NULL
);
