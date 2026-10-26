/**
 * Script migrasi gambar lama dari folder local ke Cloudinary.
 * Jalankan: node scripts/migrate-to-cloudinary.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');
const { uploadToCloudinary } = require('../src/cloudinary');

const UPLOADS_DIR = path.resolve(__dirname, '../public/uploads');
const PRODUCTS_DIR = path.join(UPLOADS_DIR, 'products');
const LOGOS_DIR = path.join(UPLOADS_DIR, 'business-logos');

async function migrateProductImages() {
  console.log('\nMigrasi gambar produk...');
  const [rows] = await db.execute(`
    SELECT pi.id, pi.image_url, pi.product_id
    FROM product_images pi
    WHERE pi.image_url NOT LIKE 'https://res.cloudinary.com%'
      AND pi.image_url NOT LIKE 'http%'
  `);

  console.log('  Ditemukan ' + rows.length + ' gambar lokal.');
  let success = 0, failed = 0;

  for (const row of rows) {
    const filename = path.basename(row.image_url);
    const localPath = path.join(PRODUCTS_DIR, filename);

    if (!fs.existsSync(localPath)) {
      console.log('  [SKIP] File tidak ada: ' + filename);
      failed++;
      continue;
    }

    try {
      const buffer = fs.readFileSync(localPath);
      const result = await uploadToCloudinary(
        buffer,
        'nusadhipa/products/' + row.product_id,
        'product-' + row.product_id + '-' + path.parse(filename).name
      );

      await db.execute(
        'UPDATE product_images SET image_url = ? WHERE id = ?',
        [result.url, row.id]
      );

      console.log('  [OK] ' + filename + ' -> ' + result.url);
      success++;
    } catch (e) {
      console.error('  [FAIL] ' + filename + ': ' + e.message);
      failed++;
    }
  }

  console.log('  Selesai: ' + success + ' sukses, ' + failed + ' gagal.');
}

async function migrateBusinessImages() {
  console.log('\nMigrasi logo & banner tenant...');
  const [rows] = await db.execute(`
    SELECT id, business_name, logo_url, banner_url
    FROM businesses
    WHERE (logo_url LIKE '/uploads/%' OR banner_url LIKE '/uploads/%')
  `);

  console.log('  Ditemukan ' + rows.length + ' tenant.');
  let success = 0;

  for (const biz of rows) {
    if (biz.logo_url && biz.logo_url.startsWith('/uploads/')) {
      const filename = path.basename(biz.logo_url);
      const localPath = path.join(LOGOS_DIR, filename);
      if (fs.existsSync(localPath)) {
        try {
          const buffer = fs.readFileSync(localPath);
          const result = await uploadToCloudinary(
            buffer,
            'nusadhipa/logos/' + biz.id,
            'logo-' + biz.id + '-' + path.parse(filename).name
          );
          await db.execute('UPDATE businesses SET logo_url = ? WHERE id = ?', [result.url, biz.id]);
          console.log('  [OK] Logo ' + biz.business_name + ' -> ' + result.url);
          success++;
        } catch (e) {
          console.error('  [FAIL] Logo ' + biz.business_name + ': ' + e.message);
        }
      }
    }

    if (biz.banner_url && biz.banner_url.startsWith('/uploads/')) {
      const filename = path.basename(biz.banner_url);
      const localPath = path.join(LOGOS_DIR, filename);
      if (fs.existsSync(localPath)) {
        try {
          const buffer = fs.readFileSync(localPath);
          const result = await uploadToCloudinary(
            buffer,
            'nusadhipa/banners/' + biz.id,
            'banner-' + biz.id + '-' + path.parse(filename).name
          );
          await db.execute('UPDATE businesses SET banner_url = ? WHERE id = ?', [result.url, biz.id]);
          console.log('  [OK] Banner ' + biz.business_name + ' -> ' + result.url);
          success++;
        } catch (e) {
          console.error('  [FAIL] Banner ' + biz.business_name + ': ' + e.message);
        }
      }
    }
  }

  console.log('  Selesai: ' + success + ' sukses.');
}

async function main() {
  try {
    console.log('Mulai migrasi ke Cloudinary...');
    await migrateProductImages();
    await migrateBusinessImages();
    console.log('\nMigrasi selesai!\n');
  } catch (e) {
    console.error('Error:', e);
  } finally {
    process.exit(0);
  }
}

main();
