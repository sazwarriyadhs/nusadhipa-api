require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "nusadhipa_marketplace",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || ""
  });

  try {
    const [identity] = await db.query("SELECT DATABASE() AS db");
    if (identity[0].db !== "nusadhipa_marketplace") {
      throw new Error("Database tidak sesuai.");
    }

    console.log("\n=== 1. SKU DAN PRODUK ===");
    const [sku] = await db.query(`
      SELECT
        COUNT(*) AS total,
        SUM(sku IS NULL OR TRIM(sku) = '') AS sku_kosong,
        COUNT(DISTINCT NULLIF(TRIM(sku), '')) AS sku_unik_terisi,
        COUNT(*) - COUNT(DISTINCT NULLIF(TRIM(sku), ''))
          - SUM(sku IS NULL OR TRIM(sku) = '') AS indikasi_duplikasi_sku
      FROM products
      WHERE business_id = 1
    `);
    console.table(sku);

    console.log("\n=== 2. VARIAN PRODUK ===");
    const [variants] = await db.query(`
      SELECT
        COUNT(*) AS total_varian,
        COUNT(DISTINCT pv.product_id) AS produk_memiliki_varian,
        SUM(pv.price = 0) AS varian_harga_nol,
        SUM(pv.is_active = 1) AS varian_aktif
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE p.business_id = 1
    `);
    console.table(variants);

    console.log("\n=== 3. GAMBAR PRODUK ===");
    const [images] = await db.query(`
      SELECT
        COUNT(*) AS total_gambar,
        COUNT(DISTINCT pi.product_id) AS produk_memiliki_gambar,
        SUM(pi.is_primary = 1) AS gambar_utama
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      WHERE p.business_id = 1
    `);
    console.table(images);

    console.log("\n=== 4. INVENTORI ===");
    const [inventory] = await db.query(`
      SELECT
        COUNT(*) AS total_record_stok,
        COUNT(DISTINCT pv.product_id) AS produk_terkait_stok,
        COALESCE(SUM(i.quantity_on_hand), 0) AS stok_tersedia,
        COALESCE(SUM(i.quantity_reserved), 0) AS stok_dipesan
      FROM inventory i
      JOIN product_variants pv ON pv.id = i.variant_id
      JOIN products p ON p.id = pv.product_id
      WHERE p.business_id = 1
    `);
    console.table(inventory);

    console.log("\n=== 5. STATUS KATEGORI ===");
    const [categories] = await db.query(`
      SELECT
        c.id, c.name, c.status,
        COUNT(p.id) AS jumlah_produk
      FROM categories c
      JOIN products p ON p.category_id = c.id
      WHERE p.business_id = 1
      GROUP BY c.id, c.name, c.status
      ORDER BY c.id
    `);
    console.table(categories);

    console.log("\n=== 6. CONTOH PRODUK UNTUK REVIEW ===");
    const [products] = await db.query(`
      SELECT
        id, name, category_id, sku, brand,
        weight_grams, requires_shipping, status
      FROM products
      WHERE business_id = 1
      ORDER BY id
      LIMIT 20
    `);
    console.table(products);

    console.log("\nAudit selesai; tidak ada data yang diubah.");
  } finally {
    await db.end();
  }
})().catch(err => {
  console.error("Audit gagal:", err.code || err.message);
  process.exitCode = 1;
});
