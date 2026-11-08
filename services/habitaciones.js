import cloudinary from '../config/cloudinary.js'
import pool from '../config/database.js'
import { HttpError } from '../utils/errors.js'
import { integer, text, money } from '../utils/validation.js'

const options = {
  tipo: ['Individual', 'Doble', 'Triple', 'Familiar', 'Suite'],
  estado: ['Disponible', 'Mantenimiento', 'Fuera de servicio'],
  tipoCama: ['Individual', 'Matrimonial', 'Queen', 'King', 'Camarote'],
  vista: ['', 'Ciudad', 'Exterior', 'Piscina', 'Jardín', 'Interior']
}
export function validateRoom(body) {
  const values = {
    numero: integer(body.numero, 'Número'), piso: integer(body.piso, 'Piso', 0, 200),
    capacidadAdultos: integer(body.capacidadAdultos, 'Adultos', 1, 100),
    capacidadNinos: integer(body.capacidadNinos === '' ? 0 : body.capacidadNinos, 'Niños', 0, 100),
    precioNoche: (money(body.precioNoche) / 100).toFixed(2),
    cantidadCamas: integer(body.cantidadCamas, 'Camas', 1, 100),
    descripcion: text(body.descripcion ?? '', 'Descripción', { min: 0, max: 4000 })
  }
  for (const [field, allowed] of Object.entries(options)) {
    if (!allowed.includes(body[field])) throw new HttpError(400, `${field} no es válido.`)
    values[field] = body[field]
  }
  for (const field of ['banioPrivado', 'aireAcondicionado', 'wifi', 'tv', 'minibar', 'balcon', 'accesible']) {
    const value = body[field]
    if (![true, false, 0, 1, '0', '1'].includes(value)) throw new HttpError(400, `${field} no es válido.`)
    values[field] = [true, 1, '1'].includes(value) ? 1 : 0
  }
  return values
}
export function validateImage(file) {
  if (!file) return
  const b = file.buffer
  const valid = (file.mimetype === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ||
    (file.mimetype === 'image/png' && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (file.mimetype === 'image/webp' && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP')
  if (!valid) throw new HttpError(400, 'El contenido del archivo no es una imagen válida.')
}
export async function createRoom(body, file) {
  const v = validateRoom(body)
  validateImage(file)
  let image
  if (file) {
    image = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload_stream({ folder: 'habitaciones', resource_type: 'image', allowed_formats: ['jpg', 'png', 'webp'] },
        (error, result) => error ? reject(error) : resolve(result)).end(file.buffer)
    })
  }
  try {
    const [result] = await pool.execute(`INSERT INTO habitacion
      (numero, piso, tipo, estado, capacidad_adultos, capacidad_ninos, precio_noche, cantidad_camas,
       tipo_cama, banio_privado, aire_acondicionado, wifi, tv, minibar, balcon, accesible, vista, descripcion, enlace_imagen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [v.numero, v.piso, v.tipo, v.estado, v.capacidadAdultos, v.capacidadNinos, v.precioNoche, v.cantidadCamas,
       v.tipoCama, v.banioPrivado, v.aireAcondicionado, v.wifi, v.tv, v.minibar, v.balcon, v.accesible, v.vista, v.descripcion, image?.secure_url || null])
    return { id: result.insertId, imagen: image?.secure_url || null }
  } catch (error) {
    if (image?.public_id) await cloudinary.uploader.destroy(image.public_id).catch(() => {})
    throw error
  }
}
