-- Quita la atención sin hora y deja el horario de partida en 08:30 a 14:00.

DROP TABLE IF EXISTS atenciones_sin_hora;

DELETE FROM parametros WHERE clave = 'atencion_sin_hora_activa';

UPDATE horarios_semanales SET hora_inicio = '08:30', hora_fin = '14:00';

UPDATE parametros SET descripcion = 'Modo de ingreso. local usa las cuentas de esta oficina.' WHERE clave = 'auth_modo';
UPDATE parametros SET descripcion = 'Hora local del recordatorio, un día antes.' WHERE clave = 'hora_recordatorio';
UPDATE parametros SET descripcion = 'Cantidad de inasistencias que marca una alerta.' WHERE clave = 'alerta_inasistencias';
UPDATE parametros SET descripcion = 'Meses que se conservan las fotos después de la cita.' WHERE clave = 'retencion_fotos_meses';
UPDATE parametros SET descripcion = 'Dirección de la oficina.' WHERE clave = 'direccion_atencion';
UPDATE parametros SET descripcion = 'Correo remitente de las citas.' WHERE clave = 'correo_remitente';
UPDATE parametros SET descripcion = 'Exámenes por hora del instructor de primera vez.' WHERE clave = 'examenes_por_hora';

UPDATE plantillas_correo
SET html = REPLACE(html, 'Para cambiarla o cancelarla, llame al {{telefono}}.', 'Para cambiarla o cancelarla, acérquese a la Dirección de Tránsito.'),
    texto = REPLACE(texto, 'Para cambiarla o cancelarla, llame al {{telefono}}.', 'Para cambiarla o cancelarla, acérquese a la Dirección de Tránsito.')
WHERE id = 'CONFIRMACION';

UPDATE plantillas_correo
SET html = REPLACE(html, 'Para pedir otra hora, llame al {{telefono}}.', 'Para pedir otra hora, acérquese a la Dirección de Tránsito.'),
    texto = REPLACE(texto, 'Para pedir otra hora, llame al {{telefono}}.', 'Para pedir otra hora, acérquese a la Dirección de Tránsito.')
WHERE id = 'CANCELACION';

UPDATE plantillas_correo
SET html = REPLACE(html, '<p>Sus datos se usan solo para esta atención.</p>', ''),
    texto = REPLACE(texto, ' Sus datos se usan solo para esta atención.', '')
WHERE id = 'CONFIRMACION';
