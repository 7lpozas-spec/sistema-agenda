INSERT INTO parametros (clave, valor, descripcion) VALUES
  ('gracia_cierre_minutos', '30', 'Minutos después del fin del último bloque para marcar inasistencias.')
ON CONFLICT(clave) DO NOTHING;
