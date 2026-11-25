-- Corrige marcas ficticias que quedaron a 30 segundos en vez de minutos de espera.
UPDATE citas
SET atencion_at = datetime(asistencia_at, '+' || (12 + (unicode(substr(id, 12, 1)) % 24)) || ' minutes')
WHERE estado IN ('ASISTIO', 'ATRASADO')
  AND asistencia_at IS NOT NULL
  AND atencion_at IS NOT NULL
  AND abs((julianday(atencion_at) - julianday(asistencia_at)) * 1440) < 2;
