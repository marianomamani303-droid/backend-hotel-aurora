import { randomBytes, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import { HttpError } from '../utils/errors.js'

export function csrfToken(req) {
  req.session.csrfToken ||= randomBytes(32).toString('hex')
  return req.session.csrfToken
}
export function checkOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const origin = req.get('Origin')
  if (origin && !env.frontendOrigins.includes(origin)) throw new HttpError(403, 'Origen no permitido.')
  if (req.get('Sec-Fetch-Site') === 'cross-site') throw new HttpError(403, 'Solicitud entre sitios no permitida.')
  next()
}
export function protectCsrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next()
  const supplied = req.get('X-CSRF-Token')
  const expected = req.session.csrfToken
  if (!supplied || !expected || !/^[a-f0-9]{64}$/.test(supplied) ||
      !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
    throw new HttpError(403, 'La solicitud expiró. Actualizá la página e intentá nuevamente.')
  }
  next()
}
