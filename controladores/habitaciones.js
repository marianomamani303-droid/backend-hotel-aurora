import pool, { transaction } from '../config/database.js'
import { createRoom } from '../services/habitaciones.js'
import { integer } from '../utils/validation.js'
import { HttpError } from '../utils/errors.js'

export async function crearHabitacion(req, res) {
  res.status(201).json({ mensaje: 'Habitación creada correctamente.', ...await createRoom(req.body, req.files?.[0]) })
}
export async function obtenerHabitaciones(req, res) {
  const [rows] = await pool.execute('SELECT * FROM habitacion ORDER BY numero')
  res.json(rows)
}
export async function DeleteHabitacion(req, res) {
  const id = integer(req.body.id, 'Habitación')
  await transaction(async db => {
    const [rooms] = await db.execute('SELECT id_habitacion FROM habitacion WHERE id_habitacion = ? FOR UPDATE', [id])
    if (!rooms.length) throw new HttpError(404, 'No se encontró la habitación.')
    const [bookings] = await db.execute('SELECT id FROM reservas WHERE id_habitacion = ? LIMIT 1 FOR UPDATE', [id])
    if (bookings.length) throw new HttpError(409, 'No se puede eliminar una habitación con reservas asociadas.')
    await db.execute('DELETE FROM habitacion WHERE id_habitacion = ?', [id])
  })
  res.json({ mensaje: 'Habitación eliminada.' })
}
