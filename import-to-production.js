const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const EXPORT_DIR = './pt-digi-export';

const FILES = [
  '01-businesses.sql',
  '02-business_kbli.sql',
  '03-business_kbli_codes.sql',
  '04-business_locations.sql',
  '05-products.sql',
  '06-product_variants.sql',
  '07-inventory.sql',
  '08-product_images.sql'
];

(async () => {
  const password = process.env.RAILWAY_DB_PASSWORD;
  if (!password) {
    console.error('❌ Set RAILWAY_DB_PASSWORD dulu');
    process.exit(1);
  }

  const db = await mysql.createConnection({
    host: 'tokaido.proxy.rlwy.net',
    port: 47958,
    user: 'root',
    password,
    database: 'railway',
    multipleStatements: true,
    connectTimeout: 30000
  });

  console.log('\n✅ Connected to Railway production\n');

  // Disable FK check sementara
  await db.query('SET FOREIGN_KEY_CHECKS = 0');

  for (const file of FILES) {
    const filePath = path.join(EXPORT_DIR, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠️ Skip ${file} (not found)`);
      continue;
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    console.log(`📥 Import: ${file}`);
    try {
      await db.query(sql);
      console.log(`   ✅ OK`);
    } catch (err) {
      console.error(`   ❌ FAILED: ${err.code || err.message}`);
      throw err;
    }
  }

  // Enable FK check
  await db.query('SET FOREIGN_KEY_CHECKS = 1');

  console.log('\n🎉 ALL IMPORTS DONE!\n');

  // Verify
  const [businesses] = await db.query('SELECT id, business_name, slug FROM businesses');
  console.log('🏢 Businesses:', businesses);

  const [products] = await db.query('SELECT id, name FROM products WHERE business_id = 2');
  console.log('\n📦 PT DIGI products:', products.length);
  products.forEach(p => console.log(`   [${p.id}] ${p.name}`));

  const [images] = await db.query('SELECT pi.id, pi.product_id, pi.image_url FROM product_images pi JOIN products p ON p.id = pi.product_id WHERE p.business_id = 2');
  console.log('\n🖼️ PT DIGI images:', images.length);
  images.forEach(i => console.log(`   [${i.product_id}] ${i.image_url}`));

  await db.end();
})().catch(err => {
  console.error('\n❌ IMPORT FAILED:', err.code || err.message);
  process.exit(1);
});
