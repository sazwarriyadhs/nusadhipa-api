require("dotenv").config();
const db = require("./src/db");

async function main() {
  try {
    const queries = [
      ["STATUS BISNIS", `
        SELECT status, COUNT(*) AS total
        FROM businesses
        WHERE id = 1
        GROUP BY status
      `],
      ["STATUS PRODUK SAURI", `
        SELECT status, COUNT(*) AS total
        FROM products
        WHERE business_id = 1
        GROUP BY status
        ORDER BY status
      `],
      ["KELENGKAPAN VARIAN", `
        SELECT
          COUNT(*) AS total_produk,
          SUM(CASE WHEN v.product_id IS NOT NULL THEN 1 ELSE 0 END)
            AS produk_dengan_varian,
          SUM(CASE WHEN v.is_active = 1 THEN 1 ELSE 0 END)
            AS produk_dengan_varian_aktif
        FROM products p
        LEFT JOIN (
          SELECT DISTINCT product_id, is_active
          FROM product_variants
        ) v ON v.product_id = p.id
        WHERE p.business_id = 1
      `],
      ["STATUS KATEGORI", `
        SELECT c.status, COUNT(DISTINCT p.id) AS total_produk
        FROM products p
        JOIN categories c ON c.id = p.category_id
        WHERE p.business_id = 1
        GROUP BY c.status
        ORDER BY c.status
      `]
    ];

    for (const [title, sql] of queries) {
      const [rows] = await db.query(sql);
      console.log("\\n=== " + title + " ===");
      console.table(rows);
    }
  } catch (error) {
    console.error("Audit gagal:", error.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main();
