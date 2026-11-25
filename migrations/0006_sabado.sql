-- El sábado se atiende. Parte en 08:30 a 14:00 y se edita en Administración.

INSERT INTO horarios_semanales (id, agenda_id, dia_semana, hora_inicio, hora_fin, cupos_por_bloque, cupo_diario)
SELECT 'hg6', 'GENERAL', 6, '08:30', '14:00', 3, 50
WHERE NOT EXISTS (SELECT 1 FROM horarios_semanales WHERE agenda_id = 'GENERAL' AND dia_semana = 6);

INSERT INTO horarios_semanales (id, agenda_id, dia_semana, hora_inicio, hora_fin, cupos_por_bloque, cupo_diario)
SELECT 'hp6', 'PRIMERA_VEZ', 6, '08:30', '14:00', 1, 10
WHERE NOT EXISTS (SELECT 1 FROM horarios_semanales WHERE agenda_id = 'PRIMERA_VEZ' AND dia_semana = 6);

UPDATE horarios_semanales
SET hora_inicio = '08:30', hora_fin = '14:00'
WHERE dia_semana = 6 AND hora_inicio = '08:30' AND hora_fin IN ('13:30', '15:00');
