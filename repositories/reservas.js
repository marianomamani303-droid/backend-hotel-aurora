import pool from '../config/database.js'

export async function ownedReservation(db, id, userId, lock = false) {
  const [rows] = await db.execute(`SELECT * FROM reservas WHERE id = ? AND id_usuario = ? ${lock ? 'FOR UPDATE' : ''}`, [id, userId])
  return rows[0]
}
export async function listOwned(userId) {
  // Columnas explícitas: h.estado y h.precio_noche no sobrescriben los de la reserva.
  const [rows] = await pool.execute(`SELECT r.*, r.id AS id_reserva,
    h.numero, h.tipo, h.descripcion, h.enlace_imagen
    FROM reservas r INNER JOIN habitacion h ON r.id_habitacion = h.id_habitacion
    WHERE r.id_usuario = ? ORDER BY r.fecha_entrada DESC, r.id DESC`, [userId])
  return rows
}
