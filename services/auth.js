import bcrypt from 'bcrypt'
import * as users from '../repositories/usuarios.js'
import * as validate from '../utils/validation.js'
import { HttpError } from '../utils/errors.js'

const dummyHash = await bcrypt.hash('invalid-login-placeholder', 12)
export async function register(body) {
  const nombres = validate.text(body.nombres, 'Nombres')
  const apellidos = validate.text(body.apellidos, 'Apellidos')
  const email = validate.email(body.email)
  const password = validate.password(body.password, true)
  if (await users.findByEmail(email)) throw new HttpError(409, 'El usuario ya está registrado.')
  return users.createUser({ nombres, apellidos, email, hash: await bcrypt.hash(password, 12) })
}
export async function login(body) {
  const email = validate.email(body.email)
  const password = validate.password(body.password)
  const user = await users.findByEmail(email)
  const valid = await bcrypt.compare(password, user?.contraseña || dummyHash)
  if (!user || !valid) throw new HttpError(401, 'Email o contraseña incorrectos.')
  return users.findPublicById(user.id)
}
