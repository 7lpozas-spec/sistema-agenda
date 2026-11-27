-- Datos de referencia de las secciones 4, 18 y 19. Sin personas.

INSERT INTO agendas (id, nombre, color, duracion_bloque_min, ventana_dias, permite_mismo_dia, recordatorio_dias_antes, activa) VALUES
  ('GENERAL', 'Agenda General', '#0b4f8a', 15, 60, 0, 1, 1),
  ('PRIMERA_VEZ', 'Agenda Primera Vez', '#0d5c38', 30, 60, 0, 1, 1);

INSERT INTO horarios_semanales (id, agenda_id, dia_semana, hora_inicio, hora_fin, cupos_por_bloque, cupo_diario) VALUES
  ('hg1', 'GENERAL', 1, '08:30', '14:00', 3, 50),
  ('hg2', 'GENERAL', 2, '08:30', '14:00', 3, 50),
  ('hg3', 'GENERAL', 3, '08:30', '14:00', 3, 50),
  ('hg4', 'GENERAL', 4, '08:30', '14:00', 3, 50),
  ('hg5', 'GENERAL', 5, '08:30', '14:00', 3, 50),
  ('hg6', 'GENERAL', 6, '08:30', '14:00', 3, 50),
  ('hp1', 'PRIMERA_VEZ', 1, '08:30', '14:00', 1, 10),
  ('hp2', 'PRIMERA_VEZ', 2, '08:30', '14:00', 1, 10),
  ('hp3', 'PRIMERA_VEZ', 3, '08:30', '14:00', 1, 10),
  ('hp4', 'PRIMERA_VEZ', 4, '08:30', '14:00', 1, 10),
  ('hp5', 'PRIMERA_VEZ', 5, '08:30', '14:00', 1, 10),
  ('hp6', 'PRIMERA_VEZ', 6, '08:30', '14:00', 1, 10);

INSERT INTO tipos_tramite (
  id, nombre, requiere_agenda, agenda_id, duracion_slot_min, cupos_que_consume,
  examen_teorico, examen_practico, requiere_carnet, requiere_licencia,
  mapeo_confirmado, nacionalidades_canje, activo, orden
) VALUES
  ('CONTROL_RENOVACION', 'Control / Renovación', 1, 'GENERAL', NULL, 1, 0, 0, 1, 1, 1, NULL, 1, 1),
  ('CONTROL_RENOVACION_L19495', 'Control / Renovación (Ley 19.495)', 1, 'GENERAL', NULL, 1, 0, 0, 1, 1, 1, NULL, 1, 2),
  ('CONTROL_RENOVACION_L18290', 'Control / Renovación (Ley 18.290)', 1, 'GENERAL', NULL, 1, 1, 0, 1, 1, 1, NULL, 1, 3),
  ('PRIMER_OTORG_NO_PROF', 'Primer Otorgamiento - Clases No Profesionales', 1, 'PRIMERA_VEZ', NULL, 1, 1, 1, 1, 0, 1, NULL, 1, 4),
  ('PRIMER_OTORG_PROF', 'Primer Otorgamiento - Clases Profesionales', 1, 'PRIMERA_VEZ', NULL, 1, 1, 1, 1, 0, 1, NULL, 1, 5),
  ('PRIMER_OTORG_ESPECIALES', 'Primer Otorgamiento - Clases Especiales', 1, 'PRIMERA_VEZ', NULL, 1, 1, 1, 1, 0, 1, NULL, 1, 6),
  ('PRIMER_OTORG_F', 'Primer Otorgamiento - Clase F', 1, 'PRIMERA_VEZ', NULL, 1, 1, 1, 1, 0, 1, NULL, 1, 7),
  ('PRIMER_OTORG_B17', 'Primer Otorgamiento Clase B 17', 1, 'PRIMERA_VEZ', NULL, 1, 1, 1, 1, 0, 1, NULL, 1, 8),
  ('DUPLICADO', 'Duplicado', 0, NULL, NULL, 1, 0, 0, 1, 0, 1, NULL, 1, 9),
  ('CANJE_EXTRANJERA', 'Canje de Licencia Extranjera', 0, NULL, NULL, 1, 0, 0, 1, 1, 0, '["Española","Coreana"]', 1, 10),
  ('REGULARIZACION', 'Regularización de Licencia', 0, NULL, NULL, 1, 0, 0, 1, 1, 0, NULL, 1, 11),
  ('CAMBIO_DOMICILIO_DATOS', 'Cambio de domicilio y otros datos', 0, NULL, NULL, 1, 0, 0, 1, 1, 0, NULL, 1, 12);

INSERT INTO clases_licencia (codigo, nombre, activa) VALUES
  ('B', 'Clase B', 1),
  ('C', 'Clase C', 1);

INSERT INTO examinadores (id, nombre, examenes_por_hora, activo) VALUES
  ('ex1', 'Examinador único (ejemplo)', 1.5, 1);

INSERT INTO feriados (fecha, nombre) VALUES
  ('2026-01-01', 'Año Nuevo'),
  ('2026-04-03', 'Viernes Santo'),
  ('2026-04-04', 'Sábado Santo'),
  ('2026-05-01', 'Día del Trabajo'),
  ('2026-05-21', 'Glorias Navales'),
  ('2026-06-21', 'Día Nacional de los Pueblos Indígenas'),
  ('2026-06-29', 'San Pedro y San Pablo'),
  ('2026-07-16', 'Virgen del Carmen'),
  ('2026-08-15', 'Asunción de la Virgen'),
  ('2026-09-18', 'Independencia Nacional'),
  ('2026-09-19', 'Glorias del Ejército'),
  ('2026-10-12', 'Encuentro de Dos Mundos'),
  ('2026-10-31', 'Día de las Iglesias Evangélicas y Protestantes'),
  ('2026-11-01', 'Todos los Santos'),
  ('2026-12-08', 'Inmaculada Concepción'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'),
  ('2027-03-26', 'Viernes Santo'),
  ('2027-03-27', 'Sábado Santo'),
  ('2027-05-01', 'Día del Trabajo'),
  ('2027-05-21', 'Glorias Navales'),
  ('2027-06-21', 'Día Nacional de los Pueblos Indígenas'),
  ('2027-06-29', 'San Pedro y San Pablo'),
  ('2027-07-16', 'Virgen del Carmen'),
  ('2027-08-15', 'Asunción de la Virgen'),
  ('2027-09-18', 'Independencia Nacional'),
  ('2027-09-19', 'Glorias del Ejército'),
  ('2027-10-12', 'Encuentro de Dos Mundos'),
  ('2027-10-31', 'Día de las Iglesias Evangélicas y Protestantes'),
  ('2027-11-01', 'Todos los Santos'),
  ('2027-12-08', 'Inmaculada Concepción'),
  ('2027-12-25', 'Navidad');

INSERT INTO parametros (clave, valor, descripcion) VALUES
  ('auth_modo', 'local', 'Modo de ingreso. local usa las cuentas de esta oficina.'),
  ('zona_horaria', 'America/Santiago', 'Zona horaria de la oficina.'),
  ('hora_cierre_automatico', '20:00', 'Hora local en que las citas AGENDADA del día pasan a NO_ASISTIO.'),
  ('hora_recordatorio', '10:00', 'Hora local del recordatorio, un día antes.'),
  ('minutos_deshacer_asistencia', '15', 'Ventana para deshacer una asistencia marcada por error.'),
  ('alerta_inasistencias', '2', 'Cantidad de inasistencias que marca una alerta.'),
  ('meses_inasistencia', '6', 'Ventana de la alerta de inasistencias.'),
  ('retencion_fotos_meses', '12', 'Meses que se conservan las fotos después de la cita.'),
  ('direccion_atencion', 'Av. Recoleta 2774, tercer piso, Edificio Consistorial', 'Dirección de la oficina.'),
  ('telefono_consultas', '22945 7917 / 22945 7920', 'Teléfonos de consulta publicados en el Anexo B.'),
  ('correo_remitente', 'licencias@ejemplo.cl', 'Correo remitente de las citas.'),
  ('logo_alt', 'Municipalidad de Recoleta. Somos todos.', 'Texto alternativo del logo oficial.'),
  ('examenes_por_hora', '1.5', 'Exámenes por hora del instructor de primera vez.'),
  ('backup_retencion_dias', '30', 'Días de retención del respaldo lógico.');

INSERT INTO plantillas_correo (id, asunto, html, texto, actualizado_at) VALUES
  ('CONFIRMACION', 'Cita agendada · {{tramite}} · {{fecha}}',
   '<p>Hola {{nombre}}:</p><p>Su cita de <strong>{{tramite}}</strong> en la {{agenda}} quedó para el {{fecha}} a las {{hora}}.</p><p>Dirección: {{direccion}}.</p><p>Documentos: {{documentos}}.</p><p>Para cambiarla o cancelarla, acérquese a la Dirección de Tránsito.</p><p><img src="{{logo_url}}" alt="Municipalidad de Recoleta. Somos todos."></p>',
   'Hola {{nombre}}. Su cita de {{tramite}} en la {{agenda}} quedó para el {{fecha}} a las {{hora}}. Dirección: {{direccion}}. Documentos: {{documentos}}. Para cambiarla o cancelarla, acérquese a la Dirección de Tránsito.',
   '2026-01-01T00:00:00.000Z'),
  ('RECORDATORIO', 'Recordatorio de cita · {{fecha}} {{hora}}',
   '<p>Hola {{nombre}}:</p><p>Le recordamos su cita de {{tramite}} el {{fecha}} a las {{hora}} ({{agenda}}).</p><p>{{direccion}}. Traiga: {{documentos}}.</p><p>Para cambiarla o cancelarla, acérquese a la Dirección de Tránsito.</p>',
   'Hola {{nombre}}. Le recordamos su cita de {{tramite}} el {{fecha}} a las {{hora}} ({{agenda}}). {{direccion}}. Traiga: {{documentos}}. Para cambiarla o cancelarla, acérquese a la Dirección de Tránsito.',
   '2026-01-01T00:00:00.000Z'),
  ('REAGENDAMIENTO', 'Su cita cambió de fecha',
   '<p>Hola {{nombre}}:</p><p>Su cita de {{tramite}} se movió al {{fecha}} a las {{hora}}. Antes era el {{fecha_anterior}}.</p>',
   'Hola {{nombre}}. Su cita de {{tramite}} se movió al {{fecha}} a las {{hora}}. Antes era el {{fecha_anterior}}.',
   '2026-01-01T00:00:00.000Z'),
  ('CANCELACION', 'Su cita fue cancelada',
   '<p>Hola {{nombre}}:</p><p>La cita de {{tramite}} del {{fecha}} a las {{hora}} fue cancelada. Para pedir otra hora, acérquese a la Dirección de Tránsito.</p>',
   'Hola {{nombre}}. La cita de {{tramite}} del {{fecha}} a las {{hora}} fue cancelada. Para pedir otra hora, acérquese a la Dirección de Tránsito.',
   '2026-01-01T00:00:00.000Z');
