-- Vacía la D1 de prueba antes de reaplicar el esquema.
-- El seed a medias (personas, citas y cupos) choca con un segundo pase.
-- Una sentencia por request. No hay claves foráneas.

DROP TABLE IF EXISTS cola_drive;
DROP TABLE IF EXISTS idempotencia;
DROP TABLE IF EXISTS correos_log;
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS documentos;
DROP TABLE IF EXISTS sesiones_captura;
DROP TABLE IF EXISTS cita_historial;
DROP TABLE IF EXISTS atenciones_sin_hora;
DROP TABLE IF EXISTS citas;
DROP TABLE IF EXISTS cupos_bloque;
DROP TABLE IF EXISTS cupos_dia;
DROP TABLE IF EXISTS disponibilidad_examinador;
DROP TABLE IF EXISTS sobrecupos;
DROP TABLE IF EXISTS excepciones_dia;
DROP TABLE IF EXISTS sesiones;
DROP TABLE IF EXISTS intentos_login;
DROP TABLE IF EXISTS ciudadanos;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS plantillas_correo;
DROP TABLE IF EXISTS examinadores;
DROP TABLE IF EXISTS clases_licencia;
DROP TABLE IF EXISTS tipos_tramite;
DROP TABLE IF EXISTS horarios_semanales;
DROP TABLE IF EXISTS feriados;
DROP TABLE IF EXISTS parametros;
DROP TABLE IF EXISTS agendas;
