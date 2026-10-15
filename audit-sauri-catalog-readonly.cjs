require("dotenv").config();
const db = require("./src/db");

async function main() {
  try {
    const tables = [
      "products",
      "product_variants",
      "product_images",
      "inventory",
      "categories"
    ];

    for (const table of tables) {
      const [exists] = await db.query(`
        SELECT COUNT(*) AS total
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
      `, [table]);

      console.log(`\n=== ${table.toUpperCase()} ===`);

      if (!exists[0].total) {
        console.log("Tabel belum tersedia.");
        continue;
      }

      const [columns] = await db.query(`
        SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
      `, [table]);

      console.table(columns);
    }

    console.log("\n=== STATUS PRODUK TENANT 1 ===");
    const [statuses] = await db.query(`
      SELECT status, COUNT(*) AS total
      FROM products
      WHERE business_id = 1
      GROUP BY status
      ORDER BY status
    `);
    console.table(statuses);

    console.log("\n=== DISTRIBUSI KATEGORI ===");
    const [categories] = await db.query(`
      SELECT p.category_id, c.name AS category_name,
             COUNT(*) AS total_products
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.business_id = 1
      GROUP BY p.category_id, c.name
      ORDER BY total_products DESC
    `);
    console.table(categories);

    console.log("\n=== KUALITAS DATA PRODUK ===");
    const [quality] = await db.query(`
      SELECT
        COUNT(*) AS total_products,
        SUM(name IS NULL OR TRIM(name) = '') AS missing_name,
        SUM(category_id IS NULL) AS missing_category,
        SUM(short_description IS NULL OR
            TRIM(short_description) = '') AS missing_short_description,
        SUM(description IS NULL OR
            TRIM(description) = '') AS missing_description,
        SUM(sku IS NULL OR TRIM(sku) = '') AS missing_sku,
        SUM(status = 'active') AS active_products
      FROM products
      WHERE business_id = 1
    `);
    console.table(quality);
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error("Audit gagal:", err.code || err.message);
  process.exitCode = 1;
});
