
import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import tls from 'node:tls'
import { fileURLToPath } from 'node:url'
import mysql from 'mysql2/promise'

const backendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

export function resolveDatabaseName(envVars = process.env) {
  const name = String(envVars.DB_NAME || '').trim()
  if (!name || name.toLowerCase() === 'sys') {
    return 'hotel_aurora'
  }
  return name
}

export function buildSslConfig(envVars = process.env) {
  const mode = String(envVars.DB_SSL || '').trim().toLowerCase()

  if (['false', '0', 'no', 'off', 'disabled'].includes(mode)) {
    return undefined
  }

  const host = String(envVars.DB_HOST || '').trim().toLowerCase()

  const rawCa = envVars.DB_SSL_CA
    ? envVars.DB_SSL_CA.replace(/\\n/g, '\n').trim()
    : ''

  const caPath = envVars.DB_SSL_CA_PATH
    ? String(envVars.DB_SSL_CA_PATH).trim()
    : ''

  const sslEnabled = Boolean(
    rawCa ||
    caPath ||
    host.endsWith('.tidbcloud.com') ||
    ['true', '1', 'yes', 'required', 'verify_ca', 'verify_identity'].includes(mode)
  )

  if (!sslEnabled) return undefined

  let ca = rawCa || undefined

  if (!ca && caPath) {
    const resolvedPath = path.isAbsolute(caPath)
      ? caPath
      : path.resolve(backendRoot, caPath)

    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`No se encontró el certificado SSL: ${caPath}`)
    }

    ca = fs.readFileSync(resolvedPath, 'utf8')
  }

  return {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
    ca: ca
      ? [ca, ...tls.rootCertificates]
      : [...tls.rootCertificates]
  }
}

const ssl = buildSslConfig()

const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: resolveDatabaseName(),
  port: Number(process.env.DB_PORT || 3306),
  ...(ssl ? { ssl } : {}),
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 100,
  dateStrings: true,
  timezone: 'Z',
  charset: 'utf8mb4',
  multipleStatements: false
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
  } finally {
    connection.release()
  }
}
