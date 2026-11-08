import { createOrder, captureOrder } from '../services/paypal.js'
export async function crear_orden(req, res) {
  res.json(await createOrder(req.user.id, req.body.idReserva))
}
export async function capturar_orden(req, res) {
  res.json(await captureOrder(req.user.id, req.body.idReserva, req.params.orderID))
}
