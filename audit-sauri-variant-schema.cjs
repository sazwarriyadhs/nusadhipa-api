require("dotenv").config();
const db = require("./src/db");

async function main() {
  try {
    const checks = [
      ["KOLOM VARIAN", `
        SHOW COLUMNS FROM product_variants
      `],
      ["CONTOH VARIAN YANG SUDAH ADA", `
        SELECT
          pv.product_id,
          p.name AS product_name,
          pv.variant_name,
          pv.price,
          pv.compare_at_price,
          pv.weight_grams,
          pv.is_active
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE p.business_id <> 1
        ORDER BY pv.id DESC
        LIMIT 10
      `],
      ["KOLOM BISNIS", `
        SHOW COLUMNS FROM businesses
      `],
      ["RINGKASAN PRODUK SAURI", `
        SELECT
          product_type,
          condition_type,
          requires_shipping,
          COUNT(*) AS total_produk,
          SUM(CASE WHEN weight_grams > 0 THEN 1 ELSE 0 END)
            AS produk_dengan_berat
        FROM products
        WHERE business_id = 1
        GROUP BY product_type, condition_type, requires_shipping
      `]
    ];

    for (const [title, sql] of checks) {
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
