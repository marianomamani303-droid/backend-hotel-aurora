import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import session from 'express-session'
import bcrypt from 'bcrypt'

process.env.SESSION_SECRET ||= 'test-only-secret-abcdefghijklmnopqrstuvwxyz-123456789'
process.env.NODE_ENV = 'test'
process.env.USER_ROLE = 'usuario'
const { createApp } = await import('../app.js')
const { default: pool, buildSslConfig, resolveDatabaseName } = await import('../config/database.js')
const { runMigrations } = await import('../scripts/migrate.js')
const { env } = await import('../config/env.js')
const { createReservation } = await import('../services/reservas.js')
const { createOrder, captureOrder, verifyPayment } = await import('../services/paypal.js')
const { validateRoom, validateImage } = await import('../services/habitaciones.js')
const { date, integer, stayTotal } = await import('../utils/validation.js')
const { MysqlSessionStore } = await import('../config/sessionStore.js')
const { OrdersController } = await import('@paypal/paypal-server-sdk')

let server, base, queries = [], reservationRows = [], overlaps = [], users
const sessionStore = new session.MemoryStore()
let commits = 0, rollbacks = 0
let paymentRows = []
const originalExecute = pool.execute
const originalGetConnection = pool.getConnection

async function execute(sql, params = []) {
  assert.equal((sql.match(/\?/g) || []).length, params.length, 'Cantidad de parámetros SQL')
  queries.push({ sql, params })
  if (sql.includes('app_rate_limits') && sql.includes('SELECT')) return [[{ hits: 1, reset_at: '2099-01-01 00:00:00.000' }]]
  if (sql.includes('app_rate_limits')) return [{ affectedRows: 1 }]
  if (sql.includes('FROM usuario WHERE email')) return [[...users.values()].filter(u => u.email === params[0])]
  if (sql.includes('FROM usuario WHERE id')) {
    const user = users.get(params[0])
    if (!user) return [[]]
    const { contraseña, ...publicUser } = user
    return [[publicUser]]
  }
  if (sql.startsWith('INSERT INTO usuario')) {
    const id = 3
    users.set(id, { id, nombres: params[0], apellidos: params[1], email: params[2], contraseña: params[3], rol: 'usuario' })
    return [{ insertId: id }]
  }
  if (sql.includes('FROM habitacion') && sql.includes('FOR UPDATE')) {
    return [[{ id_habitacion: 20, estado: 'Disponible', capacidad_adultos: 2, capacidad_ninos: 1, precio_noche: '120.50' }]]
  }
  if (sql.includes('SELECT id FROM reservas')) return [overlaps]
  if (sql.startsWith('INSERT INTO reservas')) return [{ insertId: 50 }]
  if (sql.includes('FROM reservas WHERE id =')) return [reservationRows.filter(r => r.id === params[0] && r.id_usuario === params[1])]
  if (sql.includes('FROM reservas r')) return [[]]
  if (sql.includes('SELECT * FROM app_payments')) return [paymentRows]
  if (sql.startsWith('UPDATE app_payments') || sql.startsWith('UPDATE reservas')) return [{ affectedRows: 1 }]
  if (sql.includes('app_sessions')) return [[]]
  throw new Error('Consulta inesperada en prueba: ' + sql)
}
const fakeConnection = {
  execute, beginTransaction: async () => {}, commit: async () => { commits++ },
  rollback: async () => { rollbacks++ }, release: () => {}
}
before(async () => {
  const hash = await bcrypt.hash('password123', 4)
  users = new Map([
    [1, { id: 1, nombres: 'Ana', apellidos: 'Pérez', email: 'ana@example.com', contraseña: hash, rol: 'usuario' }],
    [2, { id: 2, nombres: 'Admin', apellidos: 'Hotel', email: 'admin@example.com', contraseña: hash, rol: 'admin' }]
  ])
  pool.execute = execute
  pool.getConnection = async () => fakeConnection
  // MemoryStore exclusivamente para pruebas HTTP; producción usa MysqlSessionStore.
  const app = createApp({ sessionStore, rateLimiter: (req, res, next) => next() })
  server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  base = 'http://127.0.0.1:' + server.address().port
})
after(async () => {
  await new Promise(resolve => server.close(resolve))
  pool.execute = originalExecute
  pool.getConnection = originalGetConnection
  await pool.end()
})
async function bootstrap() {
  const response = await fetch(base + '/auth/csrf')
  return { cookie: response.headers.get('set-cookie').split(';')[0], token: (await response.json()).csrfToken, response }
}
async function call(path, method = 'GET', body, auth) {
  return fetch(base + path, { method,
    headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: auth.cookie, 'X-CSRF-Token': auth.token } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
}
async function login(email = 'ana@example.com') {
  const auth = await bootstrap()
  const response = await call('/usuariosLogin', 'POST', { email, password: 'password123' }, auth)
  assert.equal(response.status, 200)
  const data = await response.json()
  return { cookie: response.headers.get('set-cookie').split(';')[0], token: data.csrfToken, data, previous: auth.cookie }
}

test('cookie HttpOnly/SameSite y Secure compatible con HTTP local', async () => {
  const { response } = await bootstrap()
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /SameSite=Lax/)
  assert.doesNotMatch(cookie, /; Secure/)
  assert.equal(env.cookie.secure, false)
})
test('login rota sesión y CSRF; no revela hash; sesión anterior no autoriza', async () => {
  const auth = await login()
  assert.notEqual(auth.cookie, auth.previous)
  assert.equal(auth.data.usuario.contraseña, undefined)
  assert.equal((await call('/auth/me', 'GET', undefined, auth)).status, 200)
  assert.equal((await call('/auth/me', 'GET', undefined, { ...auth, cookie: auth.previous })).status, 401)
})
test('registro inicia sesión y no permite asignar el rol desde el cliente', async () => {
  const auth = await bootstrap()
  const response = await call('/usuariosRegistro', 'POST', { nombres: 'Luis', apellidos: 'Díaz', email: 'luis@example.com', password: 'password123', rol: 'admin' }, auth)
  assert.equal(response.status, 201)
  const data = await response.json()
  assert.equal(data.usuario.rol, 'usuario')
  assert.equal(queries.find(q => q.sql.startsWith('INSERT INTO usuario')).params[4], 'usuario')
  const cookie = response.headers.get('set-cookie').split(';')[0]
  assert.equal((await call('/auth/me', 'GET', undefined, { cookie, token: data.csrfToken })).status, 200)
})
test('CSRF faltante o incorrecto impide operaciones', async () => {
  assert.equal((await call('/usuariosLogin', 'POST', {})).status, 403)
  const auth = await bootstrap()
  assert.equal((await call('/usuariosLogin', 'POST', {}, { ...auth, token: 'x'.repeat(64) })).status, 403)
})
test('CORS rechaza un origen ajeno', async () => {
  const response = await fetch(base + '/auth/csrf', { headers: { Origin: 'https://malicioso.example' } })
  assert.equal(response.status, 403)
  assert.equal(response.headers.get('access-control-allow-origin'), null)
})
test('endpoints privados y todos los administrativos requieren una sesión real', async () => {
  const auth = await bootstrap()
  for (const [path, method] of [
    ['/MisReservas', 'POST'], ['/InfoDelPago', 'POST'], ['/guardarReserva', 'POST'],
    ['/paypal/crear-orden', 'POST'], ['/paypal/capturar-orden/FAKE', 'POST'],
    ['/ObtenerReservas', 'GET'], ['/obtener-info', 'GET'], ['/ObtenerHabitaciones', 'GET'],
    ['/guardarhabitaciones', 'POST'], ['/DeleteHabitacion', 'DELETE']
  ]) assert.equal((await call(path, method, method === 'GET' ? undefined : { idUsuario: 2 }, auth)).status, 401, path)
})
test('un cliente no accede al dashboard ni muta habitaciones', async () => {
  const auth = await login()
  for (const [path, method] of [
    ['/ObtenerReservas', 'GET'], ['/obtener-info', 'GET'], ['/ObtenerHabitaciones', 'GET'],
    ['/guardarhabitaciones', 'POST'], ['/DeleteHabitacion', 'DELETE']
  ]) assert.equal((await call(path, method, method === 'GET' ? undefined : {}, auth)).status, 403, path)
})
test('reservas e información de pagos ignoran idUsuario enviado por el cliente', async () => {
  const auth = await login()
  for (const path of ['/MisReservas', '/InfoDelPago']) {
    queries = []
    assert.equal((await call(path, 'POST', { idUsuario: 2 }, auth)).status, 200)
    const query = queries.find(q => q.sql.includes('FROM reservas r'))
    assert.deepEqual(query.params, [1])
  }
})
test('logout elimina la sesión en el servidor', async () => {
  const auth = await login()
  const response = await call('/auth/logout', 'POST', {}, auth)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('set-cookie'), /Expires=Thu, 01 Jan 1970/)
  assert.equal((await call('/auth/me', 'GET', undefined, auth)).status, 401)
})
test('una sesión mayor a ocho horas no autoriza aunque se reenvíe la cookie', async () => {
  const auth = await login()
  const sid = decodeURIComponent(auth.cookie.split('=')[1]).slice(2).split('.')[0]
  const data = await new Promise((resolve, reject) => sessionStore.get(sid, (error, data) => error ? reject(error) : resolve(data)))
  data.createdAt = Date.now() - env.sessionMaxAge - 1000
  await new Promise((resolve, reject) => sessionStore.set(sid, data, error => error ? reject(error) : resolve()))
  assert.equal((await call('/auth/me', 'GET', undefined, auth)).status, 401)
})
test('credenciales inexistentes e incorrectas devuelven el mismo error', async () => {
  const auth = await bootstrap()
  const a = await call('/usuariosLogin', 'POST', { email: 'nobody@example.com', password: 'password123' }, auth)
  const b = await call('/usuariosLogin', 'POST', { email: 'ana@example.com', password: 'incorrecta' }, auth)
  assert.equal(a.status, 401); assert.equal(b.status, 401)
  assert.deepEqual(await a.json(), await b.json())
})
const booking = { idHabitacion: 20, FechaDeEntrada: '2099-03-01', FechaDeSalida: '2099-03-03', Adultos: 2, Ninos: 1, idUsuario: 2, precioNoche: '0.01' }
test('reserva usa usuario y precio del servidor dentro de una transacción', async () => {
  queries = []; overlaps = []; commits = 0
  await createReservation(1, booking)
  const insert = queries.find(q => q.sql.startsWith('INSERT INTO reservas'))
  assert.deepEqual(insert.params, [1, 20, '2099-03-01', '2099-03-03', 2, 1, '120.50'])
  assert.ok(queries.some(q => q.sql.includes('FROM habitacion') && q.sql.includes('FOR UPDATE')))
  assert.equal(commits, 1)
})
test('reservas superpuestas hacen rollback y no insertan', async () => {
  queries = []; overlaps = [{ id: 99 }]; rollbacks = 0
  await assert.rejects(createReservation(1, booking), error => error.status === 409)
  assert.equal(rollbacks, 1)
  assert.equal(queries.some(q => q.sql.startsWith('INSERT INTO reservas')), false)
  overlaps = []
})
test('capacidad, fechas imposibles, estadías inválidas e IDs SQL no se aceptan', async () => {
  await assert.rejects(createReservation(1, { ...booking, Adultos: 3 }), error => error.status === 400)
  await assert.rejects(createReservation(1, { ...booking, FechaDeEntrada: '2000-01-01' }), error => error.status === 400)
  assert.throws(() => date('2026-02-30', 'Fecha'))
  assert.throws(() => integer('1 OR 1=1', 'ID'))
  assert.throws(() => stayTotal({ fecha_entrada: '2099-01-03', fecha_salida: '2099-01-01', precio_noche: '12.50' }))
  assert.deepEqual(stayTotal({ fecha_entrada: '2099-01-01', fecha_salida: '2099-01-03', precio_noche: '120.50' }), { noches: 2, total: 241, value: '241.00' })
})
test('PayPal rechaza reservas de otro usuario antes de contactar al proveedor', async () => {
  reservationRows = [{ id: 5, id_usuario: 2, estado: 'pendiente' }]
  await assert.rejects(createOrder(1, 5), error => error.status === 404)
  await assert.rejects(captureOrder(1, 5, 'ORDER1'), error => error.status === 404)
})
test('PayPal comprueba reserva, importe, moneda, estado y captura', () => {
  const payment = { order_id: 'ORDER1', reservation_id: 5, amount: '241.00', currency: 'USD' }
  const result = { id: 'ORDER1', status: 'COMPLETED', purchaseUnits: [{ customId: '5', payments: { captures: [{ id: 'CAPTURE1', status: 'COMPLETED', amount: { currencyCode: 'USD', value: '241.00' } }] } }] }
  assert.equal(verifyPayment(result, payment), 'CAPTURE1')
  for (const field of ['order_id', 'reservation_id', 'amount', 'currency']) {
    assert.throws(() => verifyPayment(result, { ...payment, [field]: field === 'amount' ? '0.01' : 'OTRO' }))
  }
  assert.throws(() => verifyPayment({ ...result, status: 'APPROVED' }, payment))
})
test('uploads rechazan contenido falso y booleanos multipart se normalizan', () => {
  assert.throws(() => validateImage({ mimetype: 'image/png', buffer: Buffer.from('<script>bad</script>') }))
  validateImage({ mimetype: 'image/png', buffer: Buffer.from([137,80,78,71,13,10,26,10]) })
  const room = validateRoom({ numero: '1', piso: '0', tipo: 'Doble', estado: 'Disponible', capacidadAdultos: '2', capacidadNinos: '', precioNoche: '120.50', cantidadCamas: '1', tipoCama: 'Queen', vista: '', descripcion: '', banioPrivado: '0', aireAcondicionado: '1', wifi: '0', tv: '0', minibar: '0', balcon: '0', accesible: '0' })
  assert.equal(room.wifi, 0); assert.equal(room.aireAcondicionado, 1)
})
test('el store persistente consulta el hash del SID y comprueba vencimiento', async () => {
  queries = []
  await new Promise((resolve, reject) => new MysqlSessionStore().get('session-sensitive-id', error => error ? reject(error) : resolve()))
  const query = queries.find(q => q.sql.includes('app_sessions'))
  assert.equal(query.params[0].length, 64)
  assert.notEqual(query.params[0], 'session-sensitive-id')
  assert.match(query.sql, /expires_at > UTC_TIMESTAMP/)
})

test('una captura completada se recupera sin volver a cobrar y se confirma en MySQL', async () => {
  const originalGet = OrdersController.prototype.getOrder
  const originalCapture = OrdersController.prototype.captureOrder
  queries = []; commits = 0
  reservationRows = [{ id: 5, id_usuario: 1, estado: 'pendiente' }]
  paymentRows = [{ order_id: 'ORDER1', reservation_id: 5, amount: '241.00', currency: 'USD', status: 'created' }]
  const result = { id: 'ORDER1', status: 'COMPLETED', purchaseUnits: [{ customId: '5', payments: { captures: [{ id: 'CAPTURE1', status: 'COMPLETED', amount: { currencyCode: 'USD', value: '241.00' } }] } }] }
  OrdersController.prototype.getOrder = async () => ({ result })
  OrdersController.prototype.captureOrder = async () => { throw new Error('No debe cobrar otra vez') }
  try {
    assert.equal((await captureOrder(1, 5, 'ORDER1')).estado, 'pagado')
    assert.equal(commits, 1)
    assert.deepEqual(queries.find(q => q.sql.startsWith('UPDATE reservas')).params, [5, 1])
    assert.deepEqual(queries.find(q => q.sql.startsWith('UPDATE app_payments')).params, ['CAPTURE1', 5])
  } finally {
    OrdersController.prototype.getOrder = originalGet
    OrdersController.prototype.captureOrder = originalCapture
  }
})
test('una orden modificada se rechaza antes de cobrar y no marca la reserva pagada', async () => {
  const originalGet = OrdersController.prototype.getOrder
  const originalCapture = OrdersController.prototype.captureOrder
  queries = []; rollbacks = 0
  OrdersController.prototype.getOrder = async () => ({ result: { id: 'ORDER1', status: 'APPROVED', purchaseUnits: [{ customId: 'OTRA', amount: { currencyCode: 'USD', value: '0.01' } }] } })
  OrdersController.prototype.captureOrder = async () => { throw new Error('No debe capturar') }
  try {
    await assert.rejects(captureOrder(1, 5, 'ORDER1'), error => error.status === 409)
    assert.equal(rollbacks, 1)
    assert.equal(queries.some(q => q.sql.startsWith('UPDATE reservas')), false)
  } finally {
    OrdersController.prototype.getOrder = originalGet
    OrdersController.prototype.captureOrder = originalCapture
  }
})

test('cookie Secure y prefijo __Host en un despliegue HTTPS', async () => {
  const cookie = env.cookie, name = env.cookieName
  env.cookie = { ...cookie, secure: true }
  env.cookieName = '__Host-aurora.sid'
  let httpsServer
  try {
    const app = createApp({ sessionStore: new session.MemoryStore(), rateLimiter: (req, res, next) => next() })
    app.set('trust proxy', 1)
    httpsServer = app.listen(0, '127.0.0.1')
    await new Promise(resolve => httpsServer.once('listening', resolve))
    const response = await fetch('http://127.0.0.1:' + httpsServer.address().port + '/auth/csrf', { headers: { 'X-Forwarded-Proto': 'https' } })
    assert.match(response.headers.get('set-cookie'), /^__Host-aurora.sid=/)
    assert.match(response.headers.get('set-cookie'), /; Secure/)
    assert.match(response.headers.get('set-cookie'), /; Path=\//)
  } finally {
    env.cookie = cookie; env.cookieName = name
    if (httpsServer) await new Promise(resolve => httpsServer.close(resolve))
  }
})

test('configuración SSL valida certificados estrictamente y resuelve base de datos', () => {
  assert.equal(buildSslConfig({ DB_SSL: 'false', DB_HOST: '127.0.0.1' }), undefined)
  const tidbSsl = buildSslConfig({ DB_HOST: 'gateway01.sa-east-1.prod.aws.tidbcloud.com', DB_SSL: 'true' })
  assert.equal(tidbSsl.minVersion, 'TLSv1.2')
  assert.equal(tidbSsl.rejectUnauthorized, true)
  assert.ok(Array.isArray(tidbSsl.ca) && tidbSsl.ca.length > 0)
  const inlineSsl = buildSslConfig({ DB_SSL: 'true', DB_SSL_CA: '-----BEGIN CERTIFICATE-----\\nTEST\\n-----END CERTIFICATE-----' })
  assert.equal(inlineSsl.rejectUnauthorized, true)
  assert.match(inlineSsl.ca[0], /BEGIN CERTIFICATE/)
  assert.equal(resolveDatabaseName({ DB_NAME: 'sys' }), 'hotel_aurora')
  assert.equal(resolveDatabaseName({ DB_NAME: 'hotel_aurora' }), 'hotel_aurora')
})

test('migración crea todas las tablas en orden de dependencias y es idempotente', async () => {
  const executed = []
  const fakeDb = {
    escape: val => `'${val}'`,
    async query(sql) {
      executed.push(sql)
      if (sql.includes("SHOW COLUMNS FROM usuario LIKE 'id'")) return [[{ Type: 'bigint' }]]
      if (sql.includes("SHOW COLUMNS FROM habitacion LIKE 'id_habitacion'")) return [[{ Type: 'bigint' }]]
      if (sql.includes("SHOW COLUMNS FROM reservas LIKE 'id'")) return [[{ Type: 'bigint' }]]
      if (sql.includes('information_schema.TABLES')) {
        return [[
          { tableName: 'usuario', engine: 'InnoDB' },
          { tableName: 'habitacion', engine: 'InnoDB' },
          { tableName: 'reservas', engine: 'InnoDB' },
          { tableName: 'app_payments', engine: 'InnoDB' },
          { tableName: 'app_sessions', engine: 'InnoDB' },
          { tableName: 'app_rate_limits', engine: 'InnoDB' }
        ]]
      }
      if (sql.includes("SHOW COLUMNS FROM usuario LIKE 'rol'")) {
        return [[{ Type: "enum('usuario','admin')", Default: 'usuario', Null: 'NO' }]]
      }
      if (sql.includes("SHOW COLUMNS FROM reservas LIKE 'estado'")) {
        return [[{ Type: "enum('pendiente','pagado','confirmada','cancelada','cancelado')", Default: 'pendiente', Null: 'NO' }]]
      }
      if (sql.includes('SHOW INDEX FROM usuario')) {
        return [[{ Key_name: 'app_usuario_email', Column_name: 'email', Non_unique: 0 }]]
      }
      if (sql.includes('SHOW INDEX FROM habitacion')) {
        return [[{ Key_name: 'app_habitacion_numero', Column_name: 'numero', Non_unique: 0 }]]
      }
      if (sql.includes('SHOW INDEX FROM reservas')) {
        return [[
          { Key_name: 'app_reservas_disponibilidad', Column_name: 'id_habitacion', Non_unique: 1 },
          { Key_name: 'app_reservas_usuario', Column_name: 'id_usuario', Non_unique: 1 }
        ]]
      }
      return [[]]
    }
  }
  await runMigrations(fakeDb, 'usuario')
  await runMigrations(fakeDb, 'usuario')
  const creates = executed.filter(s => s.startsWith('CREATE TABLE IF NOT EXISTS'))
  assert.equal(creates.length, 12)
  assert.match(creates[0], /CREATE TABLE IF NOT EXISTS usuario/)
  assert.match(creates[1], /CREATE TABLE IF NOT EXISTS habitacion/)
  assert.match(creates[2], /CREATE TABLE IF NOT EXISTS reservas/)
  assert.match(creates[3], /CREATE TABLE IF NOT EXISTS app_payments/)
  assert.match(creates[4], /CREATE TABLE IF NOT EXISTS app_sessions/)
  assert.match(creates[5], /CREATE TABLE IF NOT EXISTS app_rate_limits/)
})

