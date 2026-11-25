-- Atención en mesón de personas que vienen por un servicio que no necesita hora.
-- Los servicios se editan en Administración.

CREATE TABLE servicios_meson (
  id TEXT PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE,
  activo INTEGER NOT NULL DEFAULT 1,
  orden INTEGER NOT NULL DEFAULT 0,
  creado_at TEXT NOT NULL
);

INSERT INTO servicios_meson (id, nombre, activo, orden, creado_at) VALUES
  ('CONSULTA', 'Consulta e información', 1, 1, '2026-11-25T12:00:00.000Z'),
  ('RETIRO_LICENCIA', 'Retiro de licencia', 1, 2, '2026-11-25T12:00:00.000Z'),
  ('ENTREGA_DOCUMENTOS', 'Entrega de documentos', 1, 3, '2026-11-25T12:00:00.000Z'),
  ('DUPLICADO', 'Duplicado de licencia', 1, 4, '2026-11-25T12:00:00.000Z'),
  ('CAMBIO_DOMICILIO', 'Cambio de domicilio y datos', 1, 5, '2026-11-25T12:00:00.000Z'),
  ('CANJE_EXTRANJERA', 'Canje de licencia extranjera', 1, 6, '2026-11-25T12:00:00.000Z'),
  ('CERTIFICADO', 'Certificado de licencia', 1, 7, '2026-11-25T12:00:00.000Z');

CREATE TABLE atenciones_meson (
  id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,
  numero INTEGER NOT NULL,
  ciudadano_id TEXT,
  rut TEXT NOT NULL,
  nombre TEXT NOT NULL,
  servicio_id TEXT NOT NULL,
  observacion TEXT,
  estado TEXT NOT NULL DEFAULT 'EN_ESPERA',
  llegada_at TEXT NOT NULL,
  atencion_at TEXT,
  termino_at TEXT,
  registrado_por TEXT NOT NULL,
  atendido_por TEXT,
  actualizado_por TEXT,
  actualizado_at TEXT,
  UNIQUE (fecha, numero),
  CHECK (estado IN ('EN_ESPERA', 'EN_ATENCION', 'ATENDIDO', 'SE_RETIRO'))
);

CREATE INDEX ix_meson_fecha ON atenciones_meson (fecha, estado);
CREATE INDEX ix_meson_rut ON atenciones_meson (rut);
