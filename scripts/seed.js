import { pathToFileURL } from 'node:url'
import pool from '../config/database.js'

export const INITIAL_ROOMS = [
  {
    numero: 20,
    piso: 5,
    tipo: 'Suite',
    estado: 'Disponible',
    capacidad_adultos: 2,
    capacidad_ninos: 2,
    precio_noche: '280.00',
    cantidad_camas: 1,
    tipo_cama: 'King',
    banio_privado: 1,
    aire_acondicionado: 1,
    wifi: 1,
    tv: 1,
    minibar: 1,
    balcon: 1,
    accesible: 1,
    vista: 'Exterior',
    descripcion:
      'Suite de lujo con cama King size, balcón privado con vista panorámica y sala de estar integrada. Equipada con climatización inteligente, Smart TV UHD, minibar gourmet, Wi-Fi de alta velocidad y baño revestido en mármol con ducha efecto lluvia.',
    enlace_imagen:
      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80'
  },
  {
    numero: 80,
    piso: 3,
    tipo: 'Doble',
    estado: 'Disponible',
    capacidad_adultos: 2,
    capacidad_ninos: 1,
    precio_noche: '145.00',
    cantidad_camas: 1,
    tipo_cama: 'Queen',
    banio_privado: 1,
    aire_acondicionado: 1,
    wifi: 1,
    tv: 1,
    minibar: 1,
    balcon: 0,
    accesible: 1,
    vista: 'Ciudad',
    descripcion:
      'Habitación doble moderna con cama Queen size y amplios ventanales con vista a la ciudad. Cuenta con escritorio ejecutivo, aire acondicionado, minibar, Smart TV, Wi-Fi de alta velocidad y baño privado completo.',
    enlace_imagen:
      'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80'
  },
  {
    numero: 100,
    piso: 4,
    tipo: 'Familiar',
    estado: 'Disponible',
    capacidad_adultos: 4,
    capacidad_ninos: 2,
    precio_noche: '210.00',
    cantidad_camas: 3,
    tipo_cama: 'Queen',
    banio_privado: 1,
    aire_acondicionado: 1,
    wifi: 1,
    tv: 1,
    minibar: 1,
    balcon: 1,
    accesible: 1,
    vista: 'Jardín',
    descripcion:
      'Amplia habitación familiar premium diseñada para el descanso en familia, equipada con múltiples camas confortables, área de estar, balcón con vista al jardín, climatización independiente, minibar, Smart TV y Wi-Fi en todos los ambientes.',
    enlace_imagen:
      'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80'
  },
  {
    numero: 101,
    piso: 1,
    tipo: 'Individual',
    estado: 'Disponible',
    capacidad_adultos: 1,
    capacidad_ninos: 0,
    precio_noche: '85.00',
    cantidad_camas: 1,
    tipo_cama: 'Individual',
    banio_privado: 1,
    aire_acondicionado: 1,
    wifi: 1,
    tv: 1,
    minibar: 0,
    balcon: 0,
    accesible: 1,
    vista: 'Interior',
    descripcion:
      'Habitación individual económica y moderna, ideal para viajeros de negocios o estadías ágiles. Ofrece cama ergonómica, escritorio de trabajo iluminado, baño privado, aire acondicionado, Smart TV y conexión Wi-Fi estable.',
    enlace_imagen:
      'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80'
  },
  {
    numero: 102,
    piso: 2,
    tipo: 'Triple',
    estado: 'Disponible',
    capacidad_adultos: 3,
    capacidad_ninos: 1,
    precio_noche: '175.00',
    cantidad_camas: 3,
    tipo_cama: 'Individual',
    banio_privado: 1,
    aire_acondicionado: 1,
    wifi: 1,
    tv: 1,
    minibar: 1,
    balcon: 0,
    accesible: 1,
    vista: 'Piscina',
    descripcion:
      'Habitación triple confort de gran amplitud, ideal para grupos o amigos. Dispone de tres camas individuales con ropa blanca premium, vista a la piscina, minibar, aire acondicionado, Smart TV, Wi-Fi y baño privado.',
    enlace_imagen:
      'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1200&q=80'
  },
  {
    numero: 103,
    piso: 3,
    tipo: 'Doble',
    estado: 'Disponible',
    capacidad_adultos: 2,
    capacidad_ninos: 1,
    precio_noche: '165.00',
    cantidad_camas: 1,
    tipo_cama: 'Matrimonial',
    banio_privado: 1,
    aire_acondicionado: 1,
    wifi: 1,
    tv: 1,
    minibar: 1,
    balcon: 1,
    accesible: 0,
    vista: 'Exterior',
    descripcion:
      'Habitación doble superior muy luminosa con balcón privado y vista exterior abierta. Equipada con cama matrimonial de categoría hotelera, minibar, aire acondicionado frío/calor, Smart TV, Wi-Fi y baño privado de diseño.',
    enlace_imagen:
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80'
  }
]

export async function seedRooms(db = pool, rooms = INITIAL_ROOMS) {
  const numbers = rooms.map(r => r.numero)
  const placeholders = numbers.map(() => '?').join(', ')
  const [existingRows] = await db.execute(
    `SELECT numero FROM habitacion WHERE numero IN (${placeholders})`,
    numbers
  )
  const existingNumbers = new Set(existingRows.map(row => Number(row.numero)))

  let inserted = 0
  for (const room of rooms) {
    if (existingNumbers.has(Number(room.numero))) {
      continue
    }
    await db.execute(
      `INSERT INTO habitacion (
        numero, piso, tipo, estado, capacidad_adultos, capacidad_ninos,
        precio_noche, cantidad_camas, tipo_cama, banio_privado,
        aire_acondicionado, wifi, tv, minibar, balcon, accesible,
        vista, descripcion, enlace_imagen
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        room.numero,
        room.piso,
        room.tipo,
        room.estado,
        room.capacidad_adultos,
        room.capacidad_ninos,
        room.precio_noche,
        room.cantidad_camas,
        room.tipo_cama,
        room.banio_privado,
        room.aire_acondicionado,
        room.wifi,
        room.tv,
        room.minibar,
        room.balcon,
        room.accesible,
        room.vista,
        room.descripcion,
        room.enlace_imagen
      ]
    )
    inserted++
  }

  return { inserted, skipped: rooms.length - inserted }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    const { inserted, skipped } = await seedRooms()
    console.log(`Seed de habitaciones completado: ${inserted} insertadas, ${skipped} preexistentes conservadas sin cambios.`)
  } catch (error) {
    console.error('Error al ejecutar seed de habitaciones:', error?.code || error?.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
