import pool from '../config/database.js'
export async function MHabitacionesUsuario(req, res) {
  const [rows] = await pool.execute('SELECT * FROM habitacion ORDER BY numero')
  res.json(rows)
}
export async function habitaciones_destacadas(req, res) {
  const [rows] = await pool.execute('SELECT * FROM habitacion WHERE numero IN (20, 80, 100) ORDER BY FIELD(numero, 20, 80, 100)')
  res.json(rows)
}
