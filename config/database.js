import 'dotenv/config'
import mysql from 'mysql2/promise'

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'hotel aurora',
  port: Number(process.env.DB_PORT || 3306),
  connectionLimit: 10, waitForConnections: true, queueLimit: 100,
  dateStrings: true, timezone: 'Z', charset: 'utf8mb4', multipleStatements: false
})
export default pool

export async function transaction(work) {
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally { connection.release() }
}
