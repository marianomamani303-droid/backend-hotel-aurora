import { Router } from 'express'
import { registrarUsuario, loguearUsuario, usuarioActual, cerrarSesion } from '../controladores/login_y_registro.js'
import { crearHabitacion, obtenerHabitaciones, DeleteHabitacion } from '../controladores/habitaciones.js'
import { MHabitacionesUsuario, habitaciones_destacadas } from '../controladores/habitacionesUsuario.js'
import { guardar_reserva, obtener_reservas, obtener_pagos } from '../controladores/reservas.js'
import { crear_orden, capturar_orden } from '../controladores/paypal.js'
import { obtener_info, obtener_reservas_dashboard, verificar_admin } from '../controladores/dashboardIndex.js'
import { requireAuth, requireAdmin } from '../middlewares/auth.js'
import { csrfToken } from '../middlewares/csrf.js'
import { limiter } from '../middlewares/rateLimit.js'
import upload from '../config/upload.js'

const router = Router()
const admin = [requireAuth, requireAdmin]
router.get('/auth/csrf', (req, res) => res.json({ csrfToken: csrfToken(req) }))
router.get('/auth/me', requireAuth, usuarioActual)
router.post('/auth/logout', requireAuth, cerrarSesion)
const authIp = limiter('auth-ip', 30, 15 * 60 * 1000)
router.post('/usuariosRegistro', authIp, registrarUsuario)
router.post('/usuariosLogin', authIp, limiter('auth-account', 10, 15 * 60 * 1000, true), loguearUsuario)
router.post('/guardarReserva', requireAuth, guardar_reserva)
router.post('/MisReservas', requireAuth, obtener_reservas)
router.post('/InfoDelPago', requireAuth, obtener_pagos)
router.post('/verificarAdmin', requireAuth, verificar_admin)
router.get('/ObtenerReservas', ...admin, obtener_reservas_dashboard)
router.get('/obtener-info', ...admin, obtener_info)
router.post('/guardarhabitaciones', ...admin, upload.array('imagenes', 1), crearHabitacion)
router.get('/ObtenerHabitaciones', ...admin, obtenerHabitaciones)
router.delete('/DeleteHabitacion', ...admin, DeleteHabitacion)
router.get('/MostrarHabitacionesUsuario', MHabitacionesUsuario)
router.get('/HabitacionesDestacadas', habitaciones_destacadas)
router.post('/paypal/crear-orden', requireAuth, crear_orden)
router.post('/paypal/capturar-orden/:orderID', requireAuth, capturar_orden)
export default router
