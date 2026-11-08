import { createApp } from './app.js'
import pool from './config/database.js'
import { env } from './config/env.js'

try {
  const app = createApp()
  await pool.query('SELECT 1')
  await pool.query('SELECT sid_hash FROM app_sessions LIMIT 0')
  await pool.query('SELECT key_hash FROM app_rate_limits LIMIT 0')
  await pool.query('SELECT order_id FROM app_payments LIMIT 0')
  const server = app.listen(env.port, () => console.log(`Servidor funcionando en el puerto ${env.port}`))
  const cleanup = setInterval(() => {
    Promise.all([
      pool.query('DELETE FROM app_sessions WHERE expires_at < UTC_TIMESTAMP(3)'),
      pool.query('DELETE FROM app_rate_limits WHERE reset_at < UTC_TIMESTAMP(3)')
    ]).catch(() => console.error('No se pudieron limpiar los registros vencidos.'))
  }, 60 * 60 * 1000)
  cleanup.unref()
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      clearInterval(cleanup)
      server.close(async () => { await pool.end(); process.exit(0) })
    })
  }
} catch (error) {
  console.error('No se pudo iniciar el servidor:', error.code || error.message)
  console.error('Revisá el entorno, MySQL y ejecutá npm run db:migrate.')
  await pool.end()
  process.exitCode = 1
}
