import { HttpError } from './errors.js'

export function text(value, name, { min = 1, max = 100 } = {}) {
  if (typeof value !== 'string') throw new HttpError(400, `${name} no es válido.`)
  const result = value.trim()
  if (result.length < min || result.length > max || /[\u0000-\u001f\u007f]/.test(result)) {
    throw new HttpError(400, `${name} debe tener entre ${min} y ${max} caracteres.`)
  }
  return result
}
export function integer(value, name, min = 1, max = 2147483647) {
  if (!['string', 'number'].includes(typeof value) || !/^\d+$/.test(String(value))) throw new HttpError(400, `${name} debe ser un número entero.`)
  const result = Number(value)
  if (!Number.isSafeInteger(result) || result < min || result > max) throw new HttpError(400, `${name} debe estar entre ${min} y ${max}.`)
  return result
}
export function email(value) {
  const result = text(value, 'Email', { max: 254 }).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new HttpError(400, 'Email no válido.')
  return result
}
export function password(value, registering = false) {
  if (typeof value !== 'string' || value.length < (registering ? 8 : 1) || Buffer.byteLength(value, 'utf8') > 72) {
    throw new HttpError(400, 'La contraseña debe tener al menos 8 caracteres y hasta 72 bytes.')
  }
  return value
}
export function date(value, name) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${name} no es válida.`)
  const parsed = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new HttpError(400, `${name} no es válida.`)
  return value
}
export function money(value, name = 'Precio') {
  if (!['string', 'number'].includes(typeof value) || !/^\d+(\.\d{1,2})?$/.test(String(value))) throw new HttpError(400, `${name} debe tener hasta dos decimales.`)
  const cents = Math.round(Number(value) * 100)
  if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000) throw new HttpError(400, `${name} no es válido.`)
  return cents
}
export function stayTotal(reserva) {
  const entrada = date(String(reserva.fecha_entrada).slice(0, 10), 'Fecha de entrada')
  const salida = date(String(reserva.fecha_salida).slice(0, 10), 'Fecha de salida')
  const noches = (Date.parse(salida) - Date.parse(entrada)) / 86400000
  if (noches < 1 || noches > 365) throw new HttpError(400, 'La estadía debe durar entre 1 y 365 noches.')
  const cents = money(reserva.precio_noche) * noches
  return { noches, total: cents / 100, value: (cents / 100).toFixed(2) }
}
