import { OrdersController, CheckoutPaymentIntent } from '@paypal/paypal-server-sdk'
import paypalClient from '../config/paypal.js'
import { transaction } from '../config/database.js'
import { ownedReservation } from '../repositories/reservas.js'
import { HttpError } from '../utils/errors.js'
import { integer, stayTotal, text } from '../utils/validation.js'
import { env } from '../config/env.js'

const orders = new OrdersController(paypalClient)

export function verifyPayment(result, payment) {
  const unit = result?.purchaseUnits?.[0]
  const captures = unit?.payments?.captures || []
  const capture = captures[0]
  if (result?.id !== payment.order_id || result?.status !== 'COMPLETED' ||
      result?.purchaseUnits?.length !== 1 || unit?.customId !== String(payment.reservation_id) ||
      captures.length !== 1 || capture?.status !== 'COMPLETED' ||
      capture?.amount?.currencyCode !== payment.currency ||
      capture?.amount?.value !== Number(payment.amount).toFixed(2) || !capture?.id) {
    throw new HttpError(409, 'El pago no coincide con la reserva o todavía no fue completado.')
  }
  return capture.id
}

function ensurePayable(reserva) {
  if (!reserva) throw new HttpError(404, 'No se encontró la reserva.')
  if (['cancelada', 'cancelado'].includes(reserva.estado)) throw new HttpError(409, 'La reserva está cancelada.')
}

async function markPaid(db, payment, result, userId) {
  const captureId = verifyPayment(result, payment)
  await db.execute("UPDATE app_payments SET status = 'completed', capture_id = ?, paid_at = UTC_TIMESTAMP(3) WHERE reservation_id = ?", [captureId, payment.reservation_id])
  await db.execute("UPDATE reservas SET estado = 'pagado' WHERE id = ? AND id_usuario = ?", [payment.reservation_id, userId])
}

export async function createOrder(userId, rawId) {
  const id = integer(rawId, 'Reserva')
  return transaction(async db => {
    const reserva = await ownedReservation(db, id, userId, true)
    ensurePayable(reserva)
    if (reserva.estado === 'pagado') throw new HttpError(409, 'Esta reserva ya fue pagada.')
    const [payments] = await db.execute('SELECT * FROM app_payments WHERE reservation_id = ? FOR UPDATE', [id])
    if (payments[0]?.status === 'completed') throw new HttpError(409, 'Esta reserva ya fue pagada.')
    if (payments[0]) {
      try {
        const { result: existing } = await orders.getOrder({ id: payments[0].order_id })
        if (existing?.status === 'COMPLETED') {
          await markPaid(db, payments[0], existing, userId)
          return { id: payments[0].order_id, estado: 'pagado' }
        }
        if (existing?.status !== 'VOIDED') return { id: payments[0].order_id }
      } catch (error) {
        if (error.statusCode !== 404) throw error
      }
      // Solo reemplazar órdenes que el proveedor ya anuló o dejó de reconocer.
      await db.execute('DELETE FROM app_payments WHERE reservation_id = ? AND status = ?', [id, 'created'])
    }
    const { value } = stayTotal(reserva)
    const { result } = await orders.createOrder({
      paypalRequestId: `aurora-create-${id}`,
      body: {
        intent: CheckoutPaymentIntent.Capture,
        purchaseUnits: [{ customId: String(id), amount: { currencyCode: env.currency, value } }]
      }
    })
    if (!result?.id) throw new HttpError(502, 'No se pudo crear la orden de PayPal.')
    await db.execute('INSERT INTO app_payments (reservation_id, order_id, amount, currency, status) VALUES (?, ?, ?, ?, ?)',
      [id, result.id, value, env.currency, 'created'])
    return { id: result.id }
  })
}

export async function captureOrder(userId, rawId, rawOrderId) {
  const id = integer(rawId, 'Reserva')
  const orderId = text(rawOrderId, 'Orden', { max: 64 })
  if (!/^[A-Z0-9]+$/.test(orderId)) throw new HttpError(400, 'Orden no válida.')
  return transaction(async db => {
    const reserva = await ownedReservation(db, id, userId, true)
    ensurePayable(reserva)
    const [payments] = await db.execute('SELECT * FROM app_payments WHERE reservation_id = ? AND order_id = ? FOR UPDATE', [id, orderId])
    const payment = payments[0]
    if (!payment) throw new HttpError(404, 'La orden no corresponde a esta reserva.')
    if (payment.status === 'completed') return { mensaje: 'Pago realizado correctamente.', estado: 'pagado' }
    // Permite recuperar una captura que PayPal completó aunque MySQL haya fallado después.
    let { result } = await orders.getOrder({ id: orderId })
    if (result?.status !== 'COMPLETED') {
      const unit = result?.purchaseUnits?.[0]
      if (result?.id !== orderId || result?.purchaseUnits?.length !== 1 ||
          unit?.customId !== String(id) || unit?.amount?.currencyCode !== payment.currency ||
          unit?.amount?.value !== Number(payment.amount).toFixed(2)) {
        throw new HttpError(409, 'La orden de pago no coincide con la reserva.')
      }
      ;({ result } = await orders.captureOrder({ id: orderId, paypalRequestId: `aurora-capture-${orderId}`, prefer: 'return=representation' }))
    }
    await markPaid(db, payment, result, userId)
    return { mensaje: 'Pago realizado correctamente.', estado: 'pagado' }
  })
}
