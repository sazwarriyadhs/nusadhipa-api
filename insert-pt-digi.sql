-- ============================================================
-- Insert PT DIGI MEDIA KOMUNIKA sebagai business (UMKM - Jasa IT)
-- Owner: NUSA-DHIPA Superadmin (user_id=2, ptdigimedia@gmail.com)
-- KBLI: 62900 (KBLI 2025) — setara 62090 (KBLI 2020 di NIB 2023)
-- ============================================================

START TRANSACTION;

-- 1. Insert business
INSERT INTO businesses (
  public_id, owner_user_id, business_name, legal_name, slug,
  business_type, description, email, phone,
  province, city, address, nib, kbli_code, kbli_name,
  verification_status, status
) VALUES (
  UUID(),
  2,
  'PT DIGI MEDIA KOMUNIKA',
  'PT DIGI MEDIA KOMUNIKA',
  'pt-digi-media-komunika',
  'umkm',
  'Perusahaan teknologi informasi yang bergerak di bidang Aktivitas Teknologi Informasi dan Jasa Komputer Lainnya. Menyediakan jasa pengembangan software, konsultasi IT, integrasi sistem, dan managed IT services. (KBLI NIB: 62090, setara KBLI 2025: 62900)',
  'ptdigimedia@gmail.com',
  '08131771755',
  'Jawa Barat',
  'Kota Bogor',
  'Cimahpar Stoneyard No E1 Jl Guru Muchtar, Cimahpar, Bogor Utara, Kota Bogor, Jawa Barat',
  '2203230003021',
  '62900',
  'AKTIVITAS JASA TEKNOLOGI INFORMASI DAN KOMPUTER LAINNYA',
  'pending',
  'active'
);

SET @business_id = LAST_INSERT_ID();
SELECT @business_id AS new_business_id;

-- 2. Insert business_kbli (primary)
INSERT INTO business_kbli (business_id, kbli_code, kbli_name, is_primary)
VALUES (
  @business_id,
  '62900',
  'AKTIVITAS JASA TEKNOLOGI INFORMASI DAN KOMPUTER LAINNYA',
  1
);

-- 3. Insert business_locations (kantor pusat)
INSERT INTO business_locations (
  public_id, business_id, location_type, name,
  province, city, district, subdistrict, address, phone,
  is_primary, status
) VALUES (
  UUID(),
  @business_id,
  'office',
  'Kantor Pusat PT DIGI MEDIA KOMUNIKA',
  'Jawa Barat',
  'Kota Bogor',
  'Bogor Utara',
  'Cimahpar',
  'Cimahpar Stoneyard No E1 Jl Guru Muchtar, Cimahpar, Bogor Utara, Kota Bogor, Jawa Barat',
  '08131771755',
  1,
  'active'
);

COMMIT;

-- Verifikasi
SELECT id, public_id, business_name, slug, business_type, kbli_code, verification_status, status
FROM businesses
WHERE slug = 'pt-digi-media-komunika';
