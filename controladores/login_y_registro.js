import * as auth from '../services/auth.js'
import { csrfToken } from '../middlewares/csrf.js'
import { env } from '../config/env.js'

async function startSession(req, user) {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()))
  req.session.userId = user.id
  req.session.createdAt = Date.now()
  const token = csrfToken(req)
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()))
  return token
}
export async function registrarUsuario(req, res) {
  const usuario = await auth.register(req.body)
  const token = await startSession(req, usuario)
  res.status(201).json({ mensaje: 'Usuario registrado correctamente.', usuario, csrfToken: token })
}
export async function loguearUsuario(req, res) {
  const usuario = await auth.login(req.body)
  const token = await startSession(req, usuario)
  res.json({ mensaje: 'Has iniciado sesión exitosamente.', usuario, csrfToken: token })
}
export async function usuarioActual(req, res) {
  const token = csrfToken(req)
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()))
  res.json({ usuario: req.user, csrfToken: token })
}
export async function cerrarSesion(req, res) {
  await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()))
  res.clearCookie(env.cookieName, env.cookie)
  res.json({ mensaje: 'Sesión cerrada.' })
}
