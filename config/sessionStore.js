import session from 'express-session'
import { createHash } from 'node:crypto'
import pool from './database.js'
import { env } from './env.js'

const key = sid => createHash('sha256').update(sid).digest('hex')
const expiry = data => new Date(Math.min(new Date(data.cookie.expires).getTime(), data.createdAt ? data.createdAt + env.sessionMaxAge : Infinity))
// SID firmado en cookie; hash en MySQL. No se guardan passwords ni perfiles.
export class MysqlSessionStore extends session.Store {
  get(sid, callback) {
    pool.execute('SELECT data FROM app_sessions WHERE sid_hash = ? AND expires_at > UTC_TIMESTAMP(3)', [key(sid)])
      .then(([rows]) => callback(null, rows[0] ? JSON.parse(rows[0].data) : null)).catch(callback)
  }
  set(sid, data, callback = () => {}) {
    pool.execute(`INSERT INTO app_sessions (sid_hash, data, expires_at) VALUES (?, ?, ?)
      ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)`,
    [key(sid), JSON.stringify(data), expiry(data)]).then(() => callback()).catch(callback)
  }
  touch(sid, data, callback = () => {}) {
    pool.execute('UPDATE app_sessions SET expires_at = ? WHERE sid_hash = ?', [expiry(data), key(sid)])
      .then(() => callback()).catch(callback)
  }
  destroy(sid, callback = () => {}) {
    pool.execute('DELETE FROM app_sessions WHERE sid_hash = ?', [key(sid)]).then(() => callback()).catch(callback)
  }
}
