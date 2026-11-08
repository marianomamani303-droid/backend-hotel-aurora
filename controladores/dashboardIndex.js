import pool from '../config/database.js'
export async function obtener_info(req, res) {
  const [reservas] = await pool.execute(`SELECT *, id AS id_reserva FROM reservas
    WHERE fecha_entrada >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
    AND fecha_entrada < DATE_FORMAT(CURDATE() + INTERVAL 1 MONTH, '%Y-%m-01')
    ORDER BY id DESC`)
  const [habitaciones] = await pool.execute('SELECT * FROM habitacion ORDER BY numero')
  const ocupadas = new Set(reservas.filter(r => !['cancelada', 'cancelado'].includes(r.estado)).map(r => r.id_habitacion)).size
  res.json({ reservas, habitaciones, habitaciones_ocupadas: habitaciones.length ? ocupadas / habitaciones.length * 100 : 0 })
}
export async function obtener_reservas_dashboard(req, res) {
  const [rows] = await pool.execute(`SELECT r.*, r.id AS id_reserva,
    CONCAT(u.nombres, ' ', u.apellidos) AS nombre_usuario, h.numero, h.tipo
    FROM reservas r INNER JOIN usuario u ON r.id_usuario = u.id
    INNER JOIN habitacion h ON r.id_habitacion = h.id_habitacion
    ORDER BY r.fecha_entrada DESC, r.id DESC`)
  res.json(rows)
}
export function verificar_admin(req, res) {
  res.json({ esAdmin: req.user.rol === 'admin' })
}
