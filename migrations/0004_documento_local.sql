-- Respaldo de la foto cuando el bucket R2 no está enlazado.
ALTER TABLE documentos ADD COLUMN contenido BLOB;
ALTER TABLE documentos ADD COLUMN pagina INTEGER NOT NULL DEFAULT 1;
ALTER TABLE citas ADD COLUMN resultado TEXT;
