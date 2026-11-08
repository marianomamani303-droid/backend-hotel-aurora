import { createReservation } from '../services/reservas.js'
import { listOwned } from '../repositories/reservas.js'
import { stayTotal } from '../utils/validation.js'

export async function guardar_reserva(req, res) {
  const result = await createReservation(req.user.id, req.body)
  res.status(201).json({ mensaje: 'Habitación reservada correctamente.', ...result })
}
export async function obtener_reservas(req, res) {
  res.json(await listOwned(req.user.id))
}
export async function obtener_pagos(req, res) {
  const rows = await listOwned(req.user.id)
  const resultado = rows.map(row => ({ ...row, ...stayTotal(row) }))
  res.json({ mensaje: 'Reservas obtenidas correctamente.', resultado })
}
