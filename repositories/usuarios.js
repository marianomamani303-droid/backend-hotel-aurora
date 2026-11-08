import pool from '../config/database.js'
import { env } from '../config/env.js'
export async function findByEmail(email) {
  const [rows] = await pool.execute('SELECT id, nombres, apellidos, email, contraseña, rol FROM usuario WHERE email = ? LIMIT 1', [email])
  return rows[0]
}
export async function findPublicById(id) {
  const [rows] = await pool.execute('SELECT id, nombres, apellidos, email, rol FROM usuario WHERE id = ? LIMIT 1', [id])
  return rows[0]
}
export async function createUser({ nombres, apellidos, email, hash }) {
  // El rol público se configura en el servidor; jamás se toma del navegador.
  const [result] = await pool.execute('INSERT INTO usuario (nombres, apellidos, email, contraseña, rol) VALUES (?, ?, ?, ?, ?)', [nombres, apellidos, email, hash, env.userRole])
  return findPublicById(result.insertId)
}
