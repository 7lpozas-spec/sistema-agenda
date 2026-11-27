-- El primer otorgamiento se agenda en General. La agenda Primera Vez queda solo para el examen práctico.
UPDATE tipos_tramite
SET agenda_id = 'GENERAL'
WHERE id LIKE 'PRIMER_OTORG_%' AND agenda_id IS NOT 'GENERAL';

INSERT INTO tipos_tramite (
  id, nombre, requiere_agenda, agenda_id, duracion_slot_min, cupos_que_consume,
  examen_teorico, examen_practico, requiere_carnet, requiere_licencia,
  mapeo_confirmado, nacionalidades_canje, activo, orden
)
SELECT 'EXAMEN_PRACTICO', 'Examen práctico', 1, 'PRIMERA_VEZ', NULL, 1, 0, 1, 0, 0, 1, NULL, 1, 13
WHERE NOT EXISTS (SELECT 1 FROM tipos_tramite WHERE id = 'EXAMEN_PRACTICO');
