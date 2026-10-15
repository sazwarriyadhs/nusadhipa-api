CREATE TABLE IF NOT EXISTS business_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id CHAR(36) NOT NULL,
  business_id BIGINT UNSIGNED NOT NULL,
  location_type ENUM(
    'warehouse', 'outlet', 'office', 'distribution', 'other'
  ) NOT NULL,
  name VARCHAR(150) NOT NULL,
  province VARCHAR(100) NOT NULL,
  city VARCHAR(100) NOT NULL,
  district VARCHAR(100) NULL,
  subdistrict VARCHAR(100) NULL,
  address TEXT NOT NULL,
  postal_code VARCHAR(10) NULL,
  phone VARCHAR(30) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_business_locations_public_id (public_id),
  UNIQUE KEY uq_business_location_name (business_id, name),
  KEY idx_business_location_status (business_id, status),
  CONSTRAINT fk_business_locations_business
    FOREIGN KEY (business_id) REFERENCES businesses(id)
    ON UPDATE RESTRICT ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
