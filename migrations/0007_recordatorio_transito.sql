-- El recordatorio indica que el cambio se hace en la oficina, no por teléfono.

UPDATE plantillas_correo
SET html = '<p>Hola {{nombre}}:</p><p>Le recordamos su cita de {{tramite}} el {{fecha}} a las {{hora}} ({{agenda}}).</p><p>{{direccion}}. Traiga: {{documentos}}.</p><p>Para cambiarla o cancelarla, acérquese a la Dirección de Tránsito.</p>',
    texto = 'Hola {{nombre}}. Le recordamos su cita de {{tramite}} el {{fecha}} a las {{hora}} ({{agenda}}). {{direccion}}. Traiga: {{documentos}}. Para cambiarla o cancelarla, acérquese a la Dirección de Tránsito.'
WHERE id = 'RECORDATORIO'
  AND instr(texto, 'acérquese a la Dirección de Tránsito') = 0;
