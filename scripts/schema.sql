-- Esquema SQL completo e idempotente para Hotel Aurora (MySQL / InnoDB)
-- Ordenado según dependencias de claves foráneas.

CREATE TABLE IF NOT EXISTS usuario (
  id BIGINT NOT NULL AUTO_INCREMENT,
  nombres VARCHAR(100) NOT NULL,
  apellidos VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  `contraseña` VARCHAR(255) NOT NULL,
  rol ENUM('usuario', 'admin') NOT NULL DEFAULT 'usuario',
  PRIMARY KEY (id),
  UNIQUE KEY app_usuario_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS habitacion (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reservas (
  id BIGINT NOT NULL AUTO_INCREMENT,
  id_usuario BIGINT NOT NULL,
  id_habitacion BIGINT NOT NULL,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_payments (
  reservation_id BIGINT NOT NULL PRIMARY KEY,
  order_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  amount DECIMAL(12,2) NOT NULL,
  currency CHAR(3) NOT NULL,
  status VARCHAR(16) NOT NULL,
  capture_id VARCHAR(64) DEFAULT NULL UNIQUE,
  paid_at DATETIME(3) DEFAULT NULL,
  CONSTRAINT fk_app_payments_reserva FOREIGN KEY (reservation_id) REFERENCES reservas (id) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_sessions (
  sid_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  data MEDIUMTEXT NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  INDEX (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_rate_limits (
  key_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  hits INT UNSIGNED NOT NULL,
  reset_at DATETIME(3) NOT NULL,
  INDEX (reset_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
