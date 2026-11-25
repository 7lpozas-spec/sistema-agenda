"""Genera seed/meson.sql: atenciones de mesón sin hora, ficticias, ancladas al 2026-11-25.

Uso: python3 scripts/generar-semilla-meson.py > seed/meson.sql
Se aplica después de semilla.sql. Pocas filas, en un solo INSERT, para cuidar el límite de escritura de D1.
"""
import datetime as dt
import random

random.seed(20261125)
RECEPCION = "4b6e2a10-7c31-4e5a-9f08-2d6c1b0e8a44"
ADMIN = "135cc262-3f65-438d-9ca5-7168a66ee208"
SERVICIOS = ["CONSULTA", "RETIRO_LICENCIA", "ENTREGA_DOCUMENTOS", "DUPLICADO", "CAMBIO_DOMICILIO", "CANJE_EXTRANJERA", "CERTIFICADO"]
PESOS = [30, 25, 15, 12, 8, 4, 6]
NOMBRES = ["Rosa Tapia Lagos", "Hugo Valdés Mora", "Elena Rivas Paz", "Tomás Ibáñez Cruz", "Marta Godoy Silva", "Pablo Leiva Soto",
           "Ana Núñez Bravo", "Luis Peña Rojas", "Sofía Araya Vega", "Diego Molina Fuentes", "Carmen Saavedra Ortiz", "Raúl Cáceres León",
           "Paula Herrera Díaz", "Jorge Zamora Ríos", "Inés Figueroa Mena", "Andrés Toro Campos"]
OBS = ["", "", "", "", "Trae poder simple", "Consulta por examen médico", "Pregunta por estado de su licencia", "Viene con acompañante"]


def dv(cuerpo: int) -> str:
    suma, factor = 0, 2
    for d in reversed(str(cuerpo)):
        suma += int(d) * factor
        factor = 2 if factor == 7 else factor + 1
    r = 11 - suma % 11
    return "0" if r == 11 else "K" if r == 10 else str(r)


personas = [(f"{c}-{dv(c)}", n) for c, n in zip(range(31000100, 31000100 + len(NOMBRES)), NOMBRES)]
fechas = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-23", "2026-11-24", "2026-11-25"]
filas = []
for fecha in fechas:
    hoy = fecha == "2026-11-25"
    cantidad = 6 if hoy else random.randint(2, 5)
    minutos = sorted(random.sample(range(0, 330, 5), cantidad))
    for numero, minuto in enumerate(minutos, start=1):
        rut, nombre = random.choice(personas)
        servicio = random.choices(SERVICIOS, PESOS)[0]
        local = dt.datetime.fromisoformat(f"{fecha}T08:30:00") + dt.timedelta(minutes=minuto)
        llegada = local + dt.timedelta(hours=3)  # Chile está en UTC-3 en noviembre
        espera = random.randint(3, 28)
        duracion = random.randint(4, 15)
        if hoy and numero > 3:
            estado, atencion, termino = ("EN_ESPERA", None, None) if numero > 4 else ("EN_ATENCION", llegada + dt.timedelta(minutes=espera), None)
        else:
            estado = "SE_RETIRO" if random.random() < 0.1 else "ATENDIDO"
            atencion = None if estado == "SE_RETIRO" else llegada + dt.timedelta(minutes=espera)
            termino = llegada + dt.timedelta(minutes=espera + (0 if estado == "SE_RETIRO" else duracion))
        registro = RECEPCION if random.random() < 0.85 else ADMIN
        q = lambda v: "NULL" if v is None else "'" + str(v).replace("'", "''") + "'"
        iso = lambda v: None if v is None else v.strftime("%Y-%m-%dT%H:%M:%S.000Z")
        obs = random.choice(OBS) or None
        filas.append(
            f"  ('mes-{fecha.replace('-', '')}-{numero:02d}', '{fecha}', {numero}, NULL, '{rut}', {q(nombre)}, '{servicio}', {q(obs)}, '{estado}', "
            f"'{iso(llegada)}', {q(iso(atencion))}, {q(iso(termino))}, '{registro}', {q(registro if atencion else None)}, '{registro}', '{iso(termino or llegada)}')"
        )

print("-- Atenciones de mesón sin hora, ficticias. Generado por scripts/generar-semilla-meson.py.")
print("INSERT INTO atenciones_meson (id, fecha, numero, ciudadano_id, rut, nombre, servicio_id, observacion, estado, llegada_at, atencion_at, termino_at, registrado_por, atendido_por, actualizado_por, actualizado_at) VALUES")
print(",\n".join(filas) + ";")
