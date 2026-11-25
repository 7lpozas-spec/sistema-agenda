# Decisiones pendientes (sección 19)

Si la regla era ambigua, quedó el valor por defecto de la especificación y un comentario `TODO DECISIÓN PENDIENTE`. Todo lo operativo se cambia en Administración o en la tabla `parametros`, sin desplegar de nuevo.

| # | Decisión | Valor aplicado |
| --- | --- | --- |
| 1 | Visibilidad cruzada | Solo lectura, `puede_ver_otra_agenda = 1`. Nunca puede modificar la agenda ajena. |
| 2 | Motor | Cloudflare D1. La lógica de cupos está en `servicios/reservas.ts` para poder cambiar de motor. |
| 3 | Cuenta de Google | Cuenta de servicio sobre una carpeta o unidad compartida. No se usa una cuenta personal. Sin credenciales, el local guarda en R2 y deja la ruta `Licencias-Agendamiento/AAAA/MM/`. |
| 4 | Qué consume Primera Vez | La atención inicial. La capacidad diaria es el mínimo entre el cupo diario (10) y horas × 1,5 exámenes/hora. La segunda oportunidad no está en el catálogo. |
| 5 | Sobrecupo | El agendador puede usarlo si el Admin lo activó y `puede_usar_sobrecupo = 1`, dentro del tope. |
| 6 | Operador y fotos | Ve las fotos de las citas de hoy. No completa fotos (`puede_capturar_fotos = 0`). |
| 7 | Correo y nacimiento | El correo es obligatorio, con la opción «no tiene correo». La fecha de nacimiento es opcional. |
| 8 | Recordatorio | 1 día antes, a las 10:00, configurable por agenda (`recordatorio_dias_antes`). |
| 9 | Inasistencias | Alerta si hay 2 o más en 6 meses. No bloquea. |
| 10 | Retención de fotos | 12 meses (`retencion_fotos_meses`). |
| 11 | Autenticación | Por defecto Cloudflare Access (`AUTH_MODE=access`). En local y en las pruebas, `AUTH_MODE=local` con contraseña, porque no hay un IdP municipal conectado. |
| 12 | Correo saliente | Interfaz `MailSender`. Sin API key, el envío queda registrado en `correos_log` y no sale a internet. Remitente ficticio `licencias@ejemplo.cl`. |
| 13 | Logo | `logo_recoleta.jpg` (576×200), el archivo entregado. Falta la versión en color. |
| 14 | Dirección | Av. Recoleta 2774, tercer piso, Edificio Consistorial, tomada del Anexo B y editable. |
| 15 | Documentos del correo | Cédula y, si el tipo lo pide, licencia anterior. Falta el Anexo 1 del manual. |
| 16 | Horario | Lunes a sábado, 08:30 a 14:00. El sábado se atiende y su tramo se edita aparte en Administración → Horario. |
| 17 | Excel | `POST /api/import/citas` valida un CSV y devuelve los RUT con error. Falta el archivo real. |
| 18 | Portal ciudadano | Fuera de esta versión. |
| 19 | Canal | Cada cita guarda presencial, teléfono, correo u otro. |
| 20 | Sin hora | Duplicado, Canje, Regularización y Cambio de domicilio no aceptan cita (`TRAMITE_SIN_AGENDA`). Queda validar Canje, Regularización y Cambio con el Departamento. |
| 21 | Ampliación y cambio de clase | No se crean. El Admin puede agregarlos. |
| 22 | Exámenes | Teórico y práctico en los cinco primer otorgamiento. Teórico solo en Control / Renovación (Ley 18.290). El resto, no. |
| 23 | Atención sin hora | Eliminada. Esos trámites no se registran en el sistema. |
| 24 | Segunda oportunidad | No está en el catálogo inicial. |
| 25 | Origen del historial | No se afirma que el archivo sea del SGL. |
| 26 | Canal | Solo presencial. El cambio o la cancelación se hacen en la Dirección de Tránsito. |
