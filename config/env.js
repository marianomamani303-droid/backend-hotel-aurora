import 'dotenv/config'

const production = process.env.NODE_ENV === 'production'
export const env = {
  production,
  port: Number(process.env.PORT || 3000),
  frontendOrigins: (process.env.FRONTEND_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173').split(',').map(v => v.trim()).filter(Boolean),
  sessionSecret: process.env.SESSION_SECRET,
  userRole: process.env.USER_ROLE || 'usuario',
  sessionMaxAge: 8 * 60 * 60 * 1000,
  cookieName: production ? '__Host-aurora.sid' : 'aurora.sid',
  cookie: { httpOnly: true, secure: production, sameSite: 'lax', path: '/' },
  currency: process.env.PAYPAL_CURRENCY || 'USD',
  timeZone: process.env.HOTEL_TIMEZONE || 'America/Argentina/Buenos_Aires'
}
export function validateEnvironment() {
  if (env.userRole.toLowerCase() === 'admin') throw new Error('USER_ROLE no puede ser admin.')
  if (process.env.TRUST_PROXY_HOPS && (!/^\d+$/.test(process.env.TRUST_PROXY_HOPS) || Number(process.env.TRUST_PROXY_HOPS) < 1)) throw new Error('TRUST_PROXY_HOPS debe ser un entero positivo.')
  if (!env.sessionSecret || env.sessionSecret.length < 32) throw new Error('Configurá SESSION_SECRET con al menos 32 caracteres aleatorios.')
  if (production && (!process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.FRONTEND_ORIGINS)) {
    throw new Error('Producción requiere DB_USER, DB_PASSWORD y FRONTEND_ORIGINS explícitos.')
  }
  for (const origin of env.frontendOrigins) {
    const url = new URL(origin)
    if (url.origin !== origin || (production && url.protocol !== 'https:')) throw new Error('FRONTEND_ORIGINS debe contener orígenes exactos; usá HTTPS en producción.')
  }
}
