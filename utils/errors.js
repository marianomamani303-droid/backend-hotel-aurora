export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error)
  let status = error.status || 500
  let mensaje = status < 500 ? error.message : 'Ocurrió un error interno. Intentá nuevamente.'
  if (error.type === 'entity.parse.failed') mensaje = 'El cuerpo JSON no es válido.'
  if (error.type === 'entity.too.large') mensaje = 'La solicitud excede el tamaño permitido.'
  if (error.code === 'ER_DUP_ENTRY') {
    status = 409; mensaje = 'Ya existe un registro con esos datos.'
  } else if (error.code === 'ER_ROW_IS_REFERENCED_2') {
    status = 409; mensaje = 'No se puede eliminar una habitación con reservas asociadas.'
  } else if (error.name === 'MulterError') {
    status = 400; mensaje = 'La imagen excede los límites permitidos (una imagen de hasta 5 MB).'
  }
  // No registrar cuerpos, contraseñas, cookies ni respuestas del proveedor.
  if (status >= 500) console.error('Error del servidor:', error.code || error.name)
  res.status(status).json({ mensaje })
}
