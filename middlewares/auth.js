import { findPublicById } from '../repositories/usuarios.js'
import { HttpError } from '../utils/errors.js'
import { env } from '../config/env.js'

export async function requireAuth(req, res, next) {
  if (!req.session.userId) throw new HttpError(401, 'Iniciá sesión para continuar.')
  if (!req.session.createdAt || Date.now() - req.session.createdAt >= env.sessionMaxAge) {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()))
    throw new HttpError(401, 'La sesión expiró. Iniciá sesión nuevamente.')
  }
  req.user = await findPublicById(req.session.userId)
  if (!req.user) {
    await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()))
    throw new HttpError(401, 'La sesión dejó de ser válida.')
  }
  res.set('Cache-Control', 'no-store')
  next()
}
export function requireAdmin(req, res, next) {
  if (req.user.rol !== 'admin') throw new HttpError(403, 'No tenés permiso para acceder a esta función.')
  next()
}
