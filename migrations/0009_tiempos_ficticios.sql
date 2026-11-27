-- Días pasados ficticios: llegada en la hora citada y atención unos minutos después.
UPDATE citas
SET asistencia_marcada_por = COALESCE(asistencia_marcada_por, creado_por),
    asistencia_at = COALESCE(asistencia_at, fecha || 'T' || hora || ':00'),
    atencion_at = datetime(COALESCE(asistencia_at, fecha || 'T' || hora || ':00'), '+' || (12 + (unicode(substr(id, 12, 1)) % 24)) || ' minutes')
WHERE estado IN ('ASISTIO', 'ATRASADO')
  AND fecha < '2026-11-25'
  AND atencion_at IS NULL;
