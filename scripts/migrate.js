import { pathToFileURL } from 'node:url'
import mysql from 'mysql2/promise'
import pool, { resolveConnectionOptions, resolveDatabaseName } from '../config/database.js'
import { env } from '../config/env.js'
import { seedRooms } from './seed.js'

async function executeStep(step, work) {
  try {
    return await work()
  } catch (error) {
    if (error && typeof error === 'object' && !error.migrationStep) {
      error.migrationStep = step
    }
    throw error
  }
}

export function formatMigrationError(error) {
  return {
    step: error?.migrationStep || 'desconocido',
    code: error?.code ?? null,
    errno: error?.errno ?? null,
    sqlState: error?.sqlState ?? null,
    sqlMessage: error?.sqlMessage || error?.message || 'Error desconocido'
  }
}

function normalizeIntegerType(rawType) {
  const normalized = String(rawType || '').trim().toLowerCase()
  if (normalized.startsWith('bigint')) {
    return normalized.includes('unsigned') ? 'BIGINT UNSIGNED' : 'BIGINT'
  }
  if (normalized.startsWith('int') || normalized.startsWith('integer')) {
    return normalized.includes('unsigned') ? 'INT UNSIGNED' : 'INT'
  }
  return 'BIGINT'
}

export async function ensureDatabaseExists(envVars = process.env) {
  const dbName = resolveDatabaseName(envVars)
  if (['sys', 'information_schema', 'performance_schema', 'mysql'].includes(dbName.toLowerCase())) {
    return
  }

  const connectionOptions = resolveConnectionOptions(envVars, false)
  let connection
  try {
    connection = await executeStep('ensureDatabaseExists:connect', () =>
      mysql.createConnection(connectionOptions)
    )

    const escapedDb = dbName.replace(/`/g, '``')
    await executeStep('ensureDatabaseExists:createDatabase', () =>
      connection.query(`CREATE DATABASE IF NOT EXISTS \`${escapedDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
    )

    const [databases] = await executeStep('ensureDatabaseExists:verifyDatabase', () =>
      connection.query('SHOW DATABASES LIKE ?', [dbName])
    )
    if (!databases.length) {
      throw new Error(`La base de datos "${dbName}" no existe tras intentar crearla.`)
    }

    const [grants] = await executeStep('ensureDatabaseExists:verifyPermissions', () =>
      connection.query('SHOW GRANTS FOR CURRENT_USER()')
    )
    const grantLines = grants.map(row => Object.values(row)[0] || '').join(' ').toUpperCase()
    const hasRequiredPrivileges =
      grantLines.includes('ALL PRIVILEGES') ||
      (['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'INDEX'].every(priv => grantLines.includes(priv)))
    if (!hasRequiredPrivileges) {
      throw new Error(`El usuario de base de datos no posee permisos suficientes sobre "${dbName}".`)
    }
  } finally {
    if (connection) await connection.end().catch(() => {})
  }
}

// Migración aditiva e idempotente. Crea las tablas faltantes respetando dependencias y sin alterar datos existentes.
export async function runMigrations(db = pool, userRole = env.userRole) {
  if (!userRole || userRole.toLowerCase() === 'admin') {
    const err = new Error('USER_ROLE no puede ser admin.')
    err.migrationStep = 'validateConfig:userRole'
    throw err
  }

  const roleEnumValues = Array.from(new Set([userRole, 'usuario', 'admin']))
    .map(value => db.escape(value))
    .join(', ')

  // 1. Tabla usuario (sin dependencias)
  await executeStep('createTable:usuario', () =>
    db.query(`CREATE TABLE IF NOT EXISTS usuario (
      id BIGINT NOT NULL AUTO_INCREMENT,
      nombres VARCHAR(100) NOT NULL,
      apellidos VARCHAR(100) NOT NULL,
      email VARCHAR(254) NOT NULL,
      \`contraseña\` VARCHAR(255) NOT NULL,
      rol ENUM(${roleEnumValues}) NOT NULL DEFAULT ${db.escape(userRole)},
      PRIMARY KEY (id),
      UNIQUE KEY app_usuario_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  )

  // 2. Tabla habitacion (sin dependencias)
  await executeStep('createTable:habitacion', () =>
    db.query(`CREATE TABLE IF NOT EXISTS habitacion (
      id_habitacion BIGINT NOT NULL AUTO_INCREMENT,
      numero INT NOT NULL,
      piso INT NOT NULL DEFAULT 0,
      tipo ENUM('Individual', 'Doble', 'Triple', 'Familiar', 'Suite') NOT NULL,
      estado ENUM('Disponible', 'Mantenimiento', 'Fuera de servicio') NOT NULL DEFAULT 'Disponible',
      capacidad_adultos INT NOT NULL,
      capacidad_ninos INT NOT NULL DEFAULT 0,
      precio_noche DECIMAL(12,2) NOT NULL,
      cantidad_camas INT NOT NULL DEFAULT 1,
      tipo_cama ENUM('Individual', 'Matrimonial', 'Queen', 'King', 'Camarote') NOT NULL,
      banio_privado TINYINT(1) NOT NULL DEFAULT 0,
      aire_acondicionado TINYINT(1) NOT NULL DEFAULT 0,
      wifi TINYINT(1) NOT NULL DEFAULT 0,
      tv TINYINT(1) NOT NULL DEFAULT 0,
      minibar TINYINT(1) NOT NULL DEFAULT 0,
      balcon TINYINT(1) NOT NULL DEFAULT 0,
      accesible TINYINT(1) NOT NULL DEFAULT 0,
      vista VARCHAR(50) NOT NULL DEFAULT '',
      descripcion TEXT NULL,
      enlace_imagen VARCHAR(500) DEFAULT NULL,
      PRIMARY KEY (id_habitacion),
      UNIQUE KEY app_habitacion_numero (numero)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  )

  // Detectar tipos de clave primaria en usuario y habitacion para compatibilidad con tablas preexistentes
  const [userPk] = await executeStep('inspectColumns:usuario.id', () =>
    db.query("SHOW COLUMNS FROM usuario LIKE 'id'")
  )
  const [roomPk] = await executeStep('inspectColumns:habitacion.id_habitacion', () =>
    db.query("SHOW COLUMNS FROM habitacion LIKE 'id_habitacion'")
  )
  const userIdType = normalizeIntegerType(userPk[0]?.Type ?? userPk[0]?.type)
  const roomIdType = normalizeIntegerType(roomPk[0]?.Type ?? roomPk[0]?.type)

  // 3. Tabla reservas (depende de usuario y habitacion)
  await executeStep('createTable:reservas', () =>
    db.query(`CREATE TABLE IF NOT EXISTS reservas (
      id BIGINT NOT NULL AUTO_INCREMENT,
      id_usuario ${userIdType} NOT NULL,
      id_habitacion ${roomIdType} NOT NULL,
      fecha_entrada DATE NOT NULL,
      fecha_salida DATE NOT NULL,
      adultos INT NOT NULL,
      ninos INT NOT NULL DEFAULT 0,
      precio_noche DECIMAL(12,2) NOT NULL,
      estado ENUM('pendiente', 'pagado', 'confirmada', 'cancelada', 'cancelado') NOT NULL DEFAULT 'pendiente',
      PRIMARY KEY (id),
      KEY app_reservas_usuario (id_usuario),
      KEY app_reservas_disponibilidad (id_habitacion, fecha_entrada, fecha_salida),
      CONSTRAINT fk_reservas_usuario FOREIGN KEY (id_usuario) REFERENCES usuario (id) ON DELETE RESTRICT ON UPDATE CASCADE,
      CONSTRAINT fk_reservas_habitacion FOREIGN KEY (id_habitacion) REFERENCES habitacion (id_habitacion) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  )

  const [reservationPk] = await executeStep('inspectColumns:reservas.id', () =>
    db.query("SHOW COLUMNS FROM reservas LIKE 'id'")
  )
  const reservationIdType = normalizeIntegerType(reservationPk[0]?.Type ?? reservationPk[0]?.type)

  // 4. Tabla app_payments (depende de reservas)
  await executeStep('createTable:app_payments', () =>
    db.query(`CREATE TABLE IF NOT EXISTS app_payments (
      reservation_id ${reservationIdType} NOT NULL PRIMARY KEY,
      order_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
      amount DECIMAL(12,2) NOT NULL,
      currency CHAR(3) NOT NULL,
      status VARCHAR(16) NOT NULL,
      capture_id VARCHAR(64) DEFAULT NULL UNIQUE,
      paid_at DATETIME(3) DEFAULT NULL,
      CONSTRAINT fk_app_payments_reserva FOREIGN KEY (reservation_id) REFERENCES reservas (id) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  )

  // 5. Tabla app_sessions (sin dependencias foráneas)
  await executeStep('createTable:app_sessions', () =>
    db.query(`CREATE TABLE IF NOT EXISTS app_sessions (
      sid_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      data MEDIUMTEXT NOT NULL,
      expires_at DATETIME(3) NOT NULL,
      INDEX (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  )

  // 6. Tabla app_rate_limits (sin dependencias foráneas)
  await executeStep('createTable:app_rate_limits', () =>
    db.query(`CREATE TABLE IF NOT EXISTS app_rate_limits (
      key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
      hits INT UNSIGNED NOT NULL,
      reset_at DATETIME(3) NOT NULL,
      INDEX (reset_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  )

  // Verificación de motor InnoDB en todas las tablas del sistema
  const requiredTables = ['usuario', 'habitacion', 'reservas', 'app_payments', 'app_sessions', 'app_rate_limits']
  const [tables] = await executeStep('verifyTables:information_schema', () =>
    db.query(`SELECT TABLE_NAME AS tableName, ENGINE AS engine FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('usuario', 'habitacion', 'reservas', 'app_payments', 'app_sessions', 'app_rate_limits')`)
  )
  if (tables.length !== requiredTables.length || tables.some(t => (t.engine || t.ENGINE) !== 'InnoDB')) {
    const err = new Error('Todas las tablas del sistema deben existir y utilizar el motor InnoDB.')
    err.migrationStep = 'verifyTables:InnoDB'
    throw err
  }

  // Validaciones e índices aditivos sobre tablas preexistentes
  const [role] = await executeStep('inspectColumns:usuario.rol', () =>
    db.query("SHOW COLUMNS FROM usuario LIKE 'rol'")
  )
  if (!role[0]) {
    const err = new Error('Falta la columna usuario.rol.')
    err.migrationStep = 'verifyColumn:usuario.rol'
    throw err
  }
  const roleType = String(role[0].Type ?? role[0].type ?? '')
  const roleDefault = role[0].Default ?? role[0].default
  if (roleType.toLowerCase().startsWith('enum(') && !roleType.includes(db.escape(userRole))) {
    const err = new Error('USER_ROLE no coincide con el ENUM usuario.rol existente.')
    err.migrationStep = 'verifyColumn:usuario.rol'
    throw err
  }
  if (roleDefault === 'admin') {
    const err = new Error('El rol predeterminado de nuevos usuarios no puede ser admin.')
    err.migrationStep = 'verifyColumn:usuario.rol'
    throw err
  }

  const [columns] = await executeStep('inspectColumns:reservas.estado', () =>
    db.query("SHOW COLUMNS FROM reservas LIKE 'estado'")
  )
  const column = columns[0]
  if (!column) {
    const err = new Error('Falta la columna reservas.estado.')
    err.migrationStep = 'verifyColumn:reservas.estado'
    throw err
  }
  const estadoType = String(column.Type ?? column.type ?? '')
  const estadoNull = column.Null ?? column.null
  const estadoDefault = column.Default ?? column.default
  if (estadoType.toLowerCase().startsWith('enum(')) {
    const extra = ['pendiente', 'pagado'].filter(value => !estadoType.includes(db.escape(value)))
    if (extra.length) {
      const type = estadoType.slice(0, -1) + ',' + extra.map(value => db.escape(value)).join(',') + ')'
      const nullable = estadoNull === 'YES' ? 'NULL' : 'NOT NULL'
      const defaultValue = estadoDefault == null ? (estadoNull === 'YES' ? ' DEFAULT NULL' : '') : ' DEFAULT ' + db.escape(estadoDefault)
      await executeStep('alterTable:reservas.estado', () =>
        db.query(`ALTER TABLE reservas MODIFY estado ${type} ${nullable}${defaultValue}`)
      )
    }
  }

  const [indexes] = await executeStep('inspectIndexes:usuario', () =>
    db.query('SHOW INDEX FROM usuario')
  )
  const uniqueEmailIndex = indexes.some(i =>
    (i.Column_name || i.COLUMN_NAME) === 'email' &&
    Number(i.Non_unique ?? i.NON_UNIQUE) === 0 &&
    indexes.filter(other => (other.Key_name || other.KEY_NAME) === (i.Key_name || i.KEY_NAME)).length === 1
  )
  if (!uniqueEmailIndex) {
    // Los duplicados existentes generan un error; nunca se eliminan cuentas automáticamente.
    await executeStep('createIndex:app_usuario_email', () =>
      db.query('CREATE UNIQUE INDEX app_usuario_email ON usuario (email)')
    )
  }

  const [roomIndexes] = await executeStep('inspectIndexes:habitacion', () =>
    db.query('SHOW INDEX FROM habitacion')
  )
  if (!roomIndexes.some(i => (i.Column_name || i.COLUMN_NAME) === 'numero')) {
    await executeStep('createIndex:app_habitacion_numero', () =>
      db.query('CREATE UNIQUE INDEX app_habitacion_numero ON habitacion (numero)')
    )
  }

  const [bookingIndexes] = await executeStep('inspectIndexes:reservas', () =>
    db.query('SHOW INDEX FROM reservas')
  )
  if (!bookingIndexes.some(i => (i.Key_name || i.KEY_NAME) === 'app_reservas_disponibilidad')) {
    await executeStep('createIndex:app_reservas_disponibilidad', () =>
      db.query('CREATE INDEX app_reservas_disponibilidad ON reservas (id_habitacion, fecha_entrada, fecha_salida)')
    )
  }
  if (!bookingIndexes.some(i => (i.Column_name || i.COLUMN_NAME) === 'id_usuario')) {
    await executeStep('createIndex:app_reservas_usuario', () =>
      db.query('CREATE INDEX app_reservas_usuario ON reservas (id_usuario)')
    )
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    await ensureDatabaseExists()
    await runMigrations()
    const { inserted, skipped } = await executeStep('seedRooms:habitacion', () => seedRooms(pool))
    console.log(`Migración completada. Habitaciones iniciales: ${inserted} insertadas, ${skipped} preexistentes conservadas.`)
  } catch (error) {
    const details = formatMigrationError(error)
    console.error('Migración detenida:', details.code || details.sqlMessage)
    console.error('Detalle del fallo de migración:', JSON.stringify(details))
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
