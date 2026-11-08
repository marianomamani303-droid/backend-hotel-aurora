import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import session from 'express-session'
import { env, validateEnvironment } from './config/env.js'
import { MysqlSessionStore } from './config/sessionStore.js'
import { checkOrigin, protectCsrf } from './middlewares/csrf.js'
import { limiter } from './middlewares/rateLimit.js'
import { HttpError, errorHandler } from './utils/errors.js'
import routes from './routes/index.js'

export function createApp({ sessionStore = new MysqlSessionStore(), rateLimiter = limiter('api', 300, 15 * 60 * 1000) } = {}) {
  validateEnvironment()
  const app = express()
  app.disable('x-powered-by')
  // Configurar solo la cantidad real de proxies confiables; sin confiar en cualquier IP.
  if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS))
  app.use(helmet())
  app.use(cors({
    origin(origin, callback) {
      if (!origin || env.frontendOrigins.includes(origin)) return callback(null, true)
      callback(new HttpError(403, 'Origen no permitido.'))
    },
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'Accept']
  }))
  app.use(checkOrigin)
  app.use(rateLimiter)
  app.use(express.json({ limit: '32kb' }))
  app.use(express.urlencoded({ extended: false, limit: '32kb' }))
  app.use((req, res, next) => { req.body ||= {}; res.set('Cache-Control', 'no-store'); next() })
  app.use(session({
    name: env.cookieName, secret: env.sessionSecret, store: sessionStore,
    resave: false, saveUninitialized: false, rolling: false,
    cookie: { ...env.cookie, maxAge: env.sessionMaxAge }
  }))
  app.use(protectCsrf)
  app.use(routes)
  app.use((req, res) => res.status(404).json({ mensaje: 'Ruta no encontrada.' }))
  app.use(errorHandler)
  return app
}
