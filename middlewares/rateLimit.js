import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { createHash } from 'node:crypto'
import pool from '../config/database.js'

export class MysqlRateLimitStore {
  constructor(prefix) { this.prefix = prefix; this.localKeys = false }
  init(options) { this.windowMs = options.windowMs }
  key(value) { return createHash('sha256').update(this.prefix + ':' + value).digest('hex') }
  async increment(value) {
    const key = this.key(value)
    // LAST_INSERT_ID conserva el contador de esta operación en esta conexión.
    const db = await pool.getConnection()
    try {
      const expires = new Date(Date.now() + this.windowMs)
      await db.execute(`INSERT INTO app_rate_limits (key_hash, hits, reset_at) VALUES (?, LAST_INSERT_ID(1), ?)
        ON DUPLICATE KEY UPDATE
        hits = LAST_INSERT_ID(IF(reset_at <= UTC_TIMESTAMP(3), 1, hits + 1)),
        reset_at = IF(reset_at <= UTC_TIMESTAMP(3), VALUES(reset_at), reset_at)`, [key, expires])
      const [rows] = await db.execute('SELECT LAST_INSERT_ID() AS hits, reset_at FROM app_rate_limits WHERE key_hash = ?', [key])
      return { totalHits: Number(rows[0].hits), resetTime: new Date(rows[0].reset_at + 'Z') }
    } finally { db.release() }
  }
  async decrement(value) { await pool.execute('UPDATE app_rate_limits SET hits = GREATEST(hits - 1, 0) WHERE key_hash = ?', [this.key(value)]) }
  async resetKey(value) { await pool.execute('DELETE FROM app_rate_limits WHERE key_hash = ?', [this.key(value)]) }
}

export function limiter(prefix, limit, windowMs, perAccount = false) {
  return rateLimit({
    windowMs, limit, standardHeaders: 'draft-8', legacyHeaders: false,
    store: new MysqlRateLimitStore(prefix),
    keyGenerator: req => perAccount
      ? ipKeyGenerator(req.ip) + ':' + String(req.body?.email || '').trim().toLowerCase()
      : ipKeyGenerator(req.ip),
    message: { mensaje: 'Demasiados intentos. Esperá unos minutos e intentá nuevamente.' }
  })
}
