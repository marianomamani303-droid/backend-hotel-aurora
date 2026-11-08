import pool from '../config/database.js'
import { env } from '../config/env.js'

// Migración aditiva e idempotente sobre el esquema existente. No recrea tablas de negocio.
try {
  const [tables] = await pool.query(`SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('usuario', 'habitacion', 'reservas')`)
  if (tables.length !== 3 || tables.some(t => t.ENGINE !== 'InnoDB')) {
    throw new Error('Las tablas usuario, habitacion y reservas deben existir y utilizar InnoDB.')
  }
  const [role] = await pool.query("SHOW COLUMNS FROM usuario LIKE 'rol'")
  if (env.userRole.toLowerCase() === 'admin') throw new Error('USER_ROLE no puede ser admin.')
  if (role[0]?.Type.startsWith('enum(') && !role[0].Type.includes(pool.escape(env.userRole))) throw new Error('USER_ROLE no coincide con el ENUM usuario.rol existente.')
  if (role[0]?.Default === 'admin') throw new Error('El rol predeterminado de nuevos usuarios no puede ser admin.')
  await pool.query(`CREATE TABLE IF NOT EXISTS app_sessions (
    sid_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    data MEDIUMTEXT NOT NULL, expires_at DATETIME(3) NOT NULL, INDEX (expires_at)
  ) ENGINE=InnoDB`)
  await pool.query(`CREATE TABLE IF NOT EXISTS app_rate_limits (
    key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    hits INT UNSIGNED NOT NULL, reset_at DATETIME(3) NOT NULL, INDEX (reset_at)
  ) ENGINE=InnoDB`)
  await pool.query(`CREATE TABLE IF NOT EXISTS app_payments (
    reservation_id BIGINT NOT NULL PRIMARY KEY,
    order_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    amount DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL,
    status VARCHAR(16) NOT NULL, capture_id VARCHAR(64) UNIQUE, paid_at DATETIME(3)
  ) ENGINE=InnoDB`)
  const [columns] = await pool.query("SHOW COLUMNS FROM reservas LIKE 'estado'")
  const column = columns[0]
  if (!column) throw new Error('Falta la columna reservas.estado.')
  if (column.Type.startsWith('enum(')) {
    const extra = ['pendiente', 'pagado'].filter(value => !column.Type.includes(pool.escape(value)))
    if (extra.length) {
      const type = column.Type.slice(0, -1) + ',' + extra.map(value => pool.escape(value)).join(',') + ')'
      const nullable = column.Null === 'YES' ? 'NULL' : 'NOT NULL'
      const defaultValue = column.Default == null ? (column.Null === 'YES' ? ' DEFAULT NULL' : '') : ' DEFAULT ' + pool.escape(column.Default)
      await pool.query(`ALTER TABLE reservas MODIFY estado ${type} ${nullable}${defaultValue}`)
    }
  }
  const [indexes] = await pool.query('SHOW INDEX FROM usuario')
  const uniqueEmailIndex = indexes.some(i => i.Column_name === 'email' && i.Non_unique === 0 && indexes.filter(other => other.Key_name === i.Key_name).length === 1)
  if (!uniqueEmailIndex) {
    // Los duplicados existentes generan un error; nunca se eliminan cuentas automáticamente.
    await pool.query('CREATE UNIQUE INDEX app_usuario_email ON usuario (email)')
  }
  const [bookingIndexes] = await pool.query('SHOW INDEX FROM reservas')
  if (!bookingIndexes.some(i => i.Key_name === 'app_reservas_disponibilidad')) {
    await pool.query('CREATE INDEX app_reservas_disponibilidad ON reservas (id_habitacion, fecha_entrada, fecha_salida)')
  }
  console.log('Migración completada. No se modificaron los datos existentes.')
} catch (error) {
  console.error('Migración detenida:', error.code || error.message)
  process.exitCode = 1
} finally { await pool.end() }
