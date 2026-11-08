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

function cleanEnv(value) {
  const trimmed = String(value ?? '').trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

export function resolveDatabaseName(envVars = process.env) {
  const name = cleanEnv(envVars.DB_NAME)
  if (!name || name.toLowerCase() === 'sys') {
    return 'hotel_aurora'
  }
  return name
}

export function buildSslConfig(envVars = process.env) {
  const mode = cleanEnv(envVars.DB_SSL).toLowerCase()

  if (['false', '0', 'no', 'off', 'disabled'].includes(mode)) {
    return undefined
  }

  const host = cleanEnv(envVars.DB_HOST).toLowerCase()

  const rawCa = envVars.DB_SSL_CA
    ? cleanEnv(envVars.DB_SSL_CA).replace(/\\n/g, '\n').trim()
    : ''

  const caPath = cleanEnv(envVars.DB_SSL_CA_PATH)

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

    if (fs.existsSync(resolvedPath)) {
      ca = fs.readFileSync(resolvedPath, 'utf8')
    }
  }

  return {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true,
    ca: ca
      ? [ca, ...tls.rootCertificates]
      : [...tls.rootCertificates]
  }
}

export function resolveConnectionOptions(envVars = process.env, includeDatabase = true) {
  const ssl = buildSslConfig(envVars)
  const host = cleanEnv(envVars.DB_HOST) || '127.0.0.1'
  const user = cleanEnv(envVars.DB_USER) || 'root'
  const port = Number(cleanEnv(envVars.DB_PORT) || 3306)

  return {
    host,
    user,
    password: envVars.DB_PASSWORD || '',
    ...(includeDatabase ? { database: resolveDatabaseName(envVars) } : {}),
    port,
    ...(ssl ? { ssl } : {}),
    charset: 'utf8mb4'
  }
}

const pool = mysql.createPool({
  ...resolveConnectionOptions(process.env, true),
  connectionLimit: 10,
  waitForConnections: true,
  queueLimit: 100,
  dateStrings: true,
  timezone: 'Z',
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
