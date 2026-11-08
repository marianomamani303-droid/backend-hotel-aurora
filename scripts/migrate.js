import { pathToFileURL } from 'node:url'
import mysql from 'mysql2/promise'
import pool, { buildSslConfig, resolveDatabaseName } from '../config/database.js'
import { env } from '../config/env.js'

export async function ensureDatabaseExists(envVars = process.env) {
  const dbName = resolveDatabaseName(envVars)
  if (['sys', 'information_schema', 'performance_schema', 'mysql'].includes(dbName.toLowerCase())) {
    return
  }
  const ssl = buildSslConfig(envVars)
  let connection
  try {
    connection = await mysql.createConnection({
      host: envVars.DB_HOST || '127.0.0.1',
      user: envVars.DB_USER || 'root',
      password: envVars.DB_PASSWORD || '',
      port: Number(envVars.DB_PORT || 3306),
      ...(ssl ? { ssl } : {}),
      charset: 'utf8mb4'
    })
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName.replace(/`/g, '``')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`)
  } catch {
    // Si el proveedor externo no permite CREATE DATABASE pero la base ya fue aprovisionada, continuará con el pool.
  } finally {
    if (connection) await connection.end().catch(() => {})
  }
}

// Migración aditiva e idempotente. Crea las tablas faltantes respetando dependencias y sin alterar datos existentes.
export async function runMigrations(db = pool, userRole = env.userRole) {
  if (!userRole || userRole.toLowerCase() === 'admin') {
    throw new Error('USER_ROLE no puede ser admin.')
  }

  const roleEnumValues = Array.from(new Set([userRole, 'usuario', 'admin']))
    .map(value => db.escape(value))
    .join(', ')

  // 1. Tabla usuario (sin dependencias)
  await db.query(`CREATE TABLE IF NOT EXISTS usuario (
    id BIGINT NOT NULL AUTO_INCREMENT,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    email VARCHAR(254) NOT NULL,
    \`contraseña\` VARCHAR(255) NOT NULL,
    rol ENUM(${roleEnumValues}) NOT NULL DEFAULT ${db.escape(userRole)},
    PRIMARY KEY (id),
    UNIQUE KEY app_usuario_email (email)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  // 2. Tabla habitacion (sin dependencias)
  await db.query(`CREATE TABLE IF NOT EXISTS habitacion (
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

  // Detectar tipos de clave primaria en usuario y habitacion para compatibilidad con tablas preexistentes
  const [userPk] = await db.query("SHOW COLUMNS FROM usuario LIKE 'id'")
  const [roomPk] = await db.query("SHOW COLUMNS FROM habitacion LIKE 'id_habitacion'")
  const userIdType = userPk[0]?.Type || 'BIGINT'
  const roomIdType = roomPk[0]?.Type || 'BIGINT'

  // 3. Tabla reservas (depende de usuario y habitacion)
  await db.query(`CREATE TABLE IF NOT EXISTS reservas (
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

  const [reservationPk] = await db.query("SHOW COLUMNS FROM reservas LIKE 'id'")
  const reservationIdType = reservationPk[0]?.Type || 'BIGINT'

  // 4. Tabla app_payments (depende de reservas)
  await db.query(`CREATE TABLE IF NOT EXISTS app_payments (
    reservation_id ${reservationIdType} NOT NULL PRIMARY KEY,
    order_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
    amount DECIMAL(12,2) NOT NULL,
    currency CHAR(3) NOT NULL,
    status VARCHAR(16) NOT NULL,
    capture_id VARCHAR(64) DEFAULT NULL UNIQUE,
    paid_at DATETIME(3) DEFAULT NULL,
    CONSTRAINT fk_app_payments_reserva FOREIGN KEY (reservation_id) REFERENCES reservas (id) ON DELETE RESTRICT ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  // 5. Tabla app_sessions (sin dependencias foráneas)
  await db.query(`CREATE TABLE IF NOT EXISTS app_sessions (
    sid_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    data MEDIUMTEXT NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    INDEX (expires_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  // 6. Tabla app_rate_limits (sin dependencias foráneas)
  await db.query(`CREATE TABLE IF NOT EXISTS app_rate_limits (
    key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
    hits INT UNSIGNED NOT NULL,
    reset_at DATETIME(3) NOT NULL,
    INDEX (reset_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)

  // Verificación de motor InnoDB en todas las tablas del sistema
  const requiredTables = ['usuario', 'habitacion', 'reservas', 'app_payments', 'app_sessions', 'app_rate_limits']
  const [tables] = await db.query(`SELECT TABLE_NAME AS tableName, ENGINE AS engine FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('usuario', 'habitacion', 'reservas', 'app_payments', 'app_sessions', 'app_rate_limits')`)
  if (tables.length !== requiredTables.length || tables.some(t => (t.engine || t.ENGINE) !== 'InnoDB')) {
    throw new Error('Todas las tablas del sistema deben existir y utilizar el motor InnoDB.')
  }

  // Validaciones e índices aditivos sobre tablas preexistentes
  const [role] = await db.query("SHOW COLUMNS FROM usuario LIKE 'rol'")
  if (!role[0]) throw new Error('Falta la columna usuario.rol.')
  const roleType = String(role[0].Type || '')
  if (roleType.toLowerCase().startsWith('enum(') && !roleType.includes(db.escape(userRole))) {
    throw new Error('USER_ROLE no coincide con el ENUM usuario.rol existente.')
  }
  if (role[0].Default === 'admin') {
    throw new Error('El rol predeterminado de nuevos usuarios no puede ser admin.')
  }

  const [columns] = await db.query("SHOW COLUMNS FROM reservas LIKE 'estado'")
  const column = columns[0]
  if (!column) throw new Error('Falta la columna reservas.estado.')
  const estadoType = String(column.Type || '')
  if (estadoType.toLowerCase().startsWith('enum(')) {
    const extra = ['pendiente', 'pagado'].filter(value => !estadoType.includes(db.escape(value)))
    if (extra.length) {
      const type = estadoType.slice(0, -1) + ',' + extra.map(value => db.escape(value)).join(',') + ')'
      const nullable = column.Null === 'YES' ? 'NULL' : 'NOT NULL'
      const defaultValue = column.Default == null ? (column.Null === 'YES' ? ' DEFAULT NULL' : '') : ' DEFAULT ' + db.escape(column.Default)
      await db.query(`ALTER TABLE reservas MODIFY estado ${type} ${nullable}${defaultValue}`)
    }
  }

  const [indexes] = await db.query('SHOW INDEX FROM usuario')
  const uniqueEmailIndex = indexes.some(i => i.Column_name === 'email' && Number(i.Non_unique) === 0 && indexes.filter(other => other.Key_name === i.Key_name).length === 1)
  if (!uniqueEmailIndex) {
    // Los duplicados existentes generan un error; nunca se eliminan cuentas automáticamente.
    await db.query('CREATE UNIQUE INDEX app_usuario_email ON usuario (email)')
  }

  const [roomIndexes] = await db.query('SHOW INDEX FROM habitacion')
  if (!roomIndexes.some(i => i.Column_name === 'numero')) {
    await db.query('CREATE UNIQUE INDEX app_habitacion_numero ON habitacion (numero)')
  }

  const [bookingIndexes] = await db.query('SHOW INDEX FROM reservas')
  if (!bookingIndexes.some(i => i.Key_name === 'app_reservas_disponibilidad')) {
    await db.query('CREATE INDEX app_reservas_disponibilidad ON reservas (id_habitacion, fecha_entrada, fecha_salida)')
  }
  if (!bookingIndexes.some(i => i.Column_name === 'id_usuario')) {
    await db.query('CREATE INDEX app_reservas_usuario ON reservas (id_usuario)')
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  try {
    await ensureDatabaseExists()
    await runMigrations()
    console.log('Migración completada. No se modificaron los datos existentes.')
  } catch (error) {
    console.error('Migración detenida:', error.code || error.message)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
