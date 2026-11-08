import multer from 'multer'
import { HttpError } from '../utils/errors.js'
export default multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 19, fieldSize: 8192, parts: 20 },
  fileFilter(req, file, callback) {
    callback(['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype) ? null : new HttpError(400, 'Usá una imagen JPG, PNG o WebP.'), true)
  }
})
