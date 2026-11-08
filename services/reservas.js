import { transaction } from '../config/database.js'
import { HttpError } from '../utils/errors.js'
import { date, integer, money, stayTotal } from '../utils/validation.js'
import { env } from '../config/env.js'

export async function createReservation(userId, body) {
  const id = integer(body.idHabitacion, 'Habitación')
  const entrada = date(body.FechaDeEntrada, 'Fecha de entrada')
  const salida = date(body.FechaDeSalida, 'Fecha de salida')
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: env.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  if (entrada < today) throw new HttpError(400, 'La fecha de entrada no puede estar en el pasado.')
  const adultos = integer(body.Adultos, 'Adultos', 1, 100)
  const ninos = integer(body.Ninos, 'Niños', 0, 100)
  return transaction(async db => {
    // Todas las creaciones bloquean la misma habitación: evita dobles reservas concurrentes.
    const [rooms] = await db.execute('SELECT * FROM habitacion WHERE id_habitacion = ? FOR UPDATE', [id])
    const room = rooms[0]
    if (!room) throw new HttpError(404, 'No se encontró la habitación.')
    if (room.estado?.toLowerCase() !== 'disponible') throw new HttpError(409, 'La habitación no está disponible.')
    if (adultos > room.capacidad_adultos || ninos > room.capacidad_ninos) throw new HttpError(400, 'La cantidad de huéspedes excede la capacidad.')
    const { noches } = stayTotal({ fecha_entrada: entrada, fecha_salida: salida, precio_noche: room.precio_noche })
    const [overlaps] = await db.execute(`SELECT id FROM reservas WHERE id_habitacion = ?
      AND (estado IS NULL OR estado NOT IN ('cancelada', 'cancelado'))
      AND fecha_entrada < ? AND fecha_salida > ? LIMIT 1 FOR UPDATE`, [id, salida, entrada])
    if (overlaps.length) throw new HttpError(409, 'La habitación ya tiene una reserva para esas fechas.')
    const precio = (money(room.precio_noche) / 100).toFixed(2)
    const [result] = await db.execute(`INSERT INTO reservas
      (id_usuario, id_habitacion, fecha_entrada, fecha_salida, adultos, ninos, precio_noche, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`, [userId, id, entrada, salida, adultos, ninos, precio])
    return { id: result.insertId, noches }
  })
}
