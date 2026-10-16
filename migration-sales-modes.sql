-- NUSA-DHIPA: konfigurasi mode penjualan per varian
-- File ini BELUM dijalankan terhadap database.

ALTER TABLE product_variants
  ADD COLUMN sales_mode ENUM('package', 'weight') NOT NULL DEFAULT 'package',
  ADD COLUMN min_retail_kg DECIMAL(12,3) DEFAULT 0.500,
  ADD COLUMN min_b2b_kg DECIMAL(12,3) DEFAULT 50.000,
  ADD COLUMN retail_step_kg DECIMAL(12,3) DEFAULT 0.500,
  ADD COLUMN b2b_step_kg DECIMAL(12,3) DEFAULT 1.000,
  ADD COLUMN b2b_price DECIMAL(18,2) DEFAULT NULL,
  ADD COLUMN retail_price DECIMAL(18,2) DEFAULT NULL;
