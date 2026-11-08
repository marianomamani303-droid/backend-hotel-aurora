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

-- Seed idempotente de las 6 habitaciones iniciales (destacadas: 20, 80, 100; adicionales: 101, 102, 103)
INSERT IGNORE INTO habitacion (
  numero, piso, tipo, estado, capacidad_adultos, capacidad_ninos,
  precio_noche, cantidad_camas, tipo_cama, banio_privado,
  aire_acondicionado, wifi, tv, minibar, balcon, accesible,
  vista, descripcion, enlace_imagen
) VALUES
  (20, 5, 'Suite', 'Disponible', 2, 2, 280.00, 1, 'King', 1, 1, 1, 1, 1, 1, 1, 'Exterior', 'Suite de lujo con cama King size, balcón privado con vista panorámica y sala de estar integrada. Equipada con climatización inteligente, Smart TV UHD, minibar gourmet, Wi-Fi de alta velocidad y baño revestido en mármol con ducha efecto lluvia.', 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80'),
  (80, 3, 'Doble', 'Disponible', 2, 1, 145.00, 1, 'Queen', 1, 1, 1, 1, 1, 0, 1, 'Ciudad', 'Habitación doble moderna con cama Queen size y amplios ventanales con vista a la ciudad. Cuenta con escritorio ejecutivo, aire acondicionado, minibar, Smart TV, Wi-Fi de alta velocidad y baño privado completo.', 'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80'),
  (100, 4, 'Familiar', 'Disponible', 4, 2, 210.00, 3, 'Queen', 1, 1, 1, 1, 1, 1, 1, 'Jardín', 'Amplia habitación familiar premium diseñada para el descanso en familia, equipada con múltiples camas confortables, área de estar, balcón con vista al jardín, climatización independiente, minibar, Smart TV y Wi-Fi en todos los ambientes.', 'https://images.unsplash.com/photo-1566665797739-1674de7a421a?auto=format&fit=crop&w=1200&q=80'),
  (101, 1, 'Individual', 'Disponible', 1, 0, 85.00, 1, 'Individual', 1, 1, 1, 1, 0, 0, 1, 'Interior', 'Habitación individual económica y moderna, ideal para viajeros de negocios o estadías ágiles. Ofrece cama ergonómica, escritorio de trabajo iluminado, baño privado, aire acondicionado, Smart TV y conexión Wi-Fi estable.', 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80'),
  (102, 2, 'Triple', 'Disponible', 3, 1, 175.00, 3, 'Individual', 1, 1, 1, 1, 1, 0, 1, 'Piscina', 'Habitación triple confort de gran amplitud, ideal para grupos o amigos. Dispone de tres camas individuales con ropa blanca premium, vista a la piscina, minibar, aire acondicionado, Smart TV, Wi-Fi y baño privado.', 'https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=1200&q=80'),
  (103, 3, 'Doble', 'Disponible', 2, 1, 165.00, 1, 'Matrimonial', 1, 1, 1, 1, 1, 1, 0, 'Exterior', 'Habitación doble superior muy luminosa con balcón privado y vista exterior abierta. Equipada con cama matrimonial de categoría hotelera, minibar, aire acondicionado frío/calor, Smart TV, Wi-Fi y baño privado de diseño.', 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80');
