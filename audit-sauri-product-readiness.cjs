require("dotenv").config();
const db = require("./src/db");

async function main() {
  try {
    console.log("\n=== DAFTAR 62 PRODUK DAN KELENGKAPANNYA ===");

    const [products] = await db.query(`
      SELECT
        p.id,
        p.name,
        c.name AS category_name,
        p.sku,
        p.status,
        COALESCE(v.variant_count, 0) AS variant_count,
        COALESCE(v.price_count, 0) AS priced_variants,
        v.min_price,
        v.max_price,
        COALESCE(i.image_count, 0) AS image_count,
        COALESCE(v.inventory_count, 0) AS inventory_records,
        COALESCE(v.stock_units, 0) AS stock_units
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      LEFT JOIN (
        SELECT
          pv.product_id,
          COUNT(*) AS variant_count,
          SUM(pv.price > 0) AS price_count,
          MIN(pv.price) AS min_price,
          MAX(pv.price) AS max_price,
          COUNT(DISTINCT inv.id) AS inventory_count,
          SUM(COALESCE(inv.quantity_on_hand, 0)) AS stock_units
        FROM product_variants pv
        LEFT JOIN inventory inv ON inv.variant_id = pv.id
        GROUP BY pv.product_id
      ) v ON v.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS image_count
        FROM product_images
        GROUP BY product_id
      ) i ON i.product_id = p.id
      WHERE p.business_id = 1
      ORDER BY p.id
    `);

    console.table(products);

    console.log("\n=== RINGKASAN KELENGKAPAN ===");
    const [summary] = await db.query(`
      SELECT
        COUNT(*) AS total_products,
        SUM(p.sku IS NOT NULL AND TRIM(p.sku) <> '') AS with_sku,
        SUM(COALESCE(v.variant_count, 0) > 0) AS with_variants,
        SUM(COALESCE(v.price_count, 0) > 0) AS with_positive_price,
        SUM(COALESCE(i.image_count, 0) > 0) AS with_images,
        SUM(COALESCE(v.inventory_count, 0) > 0) AS with_inventory
      FROM products p
      LEFT JOIN (
        SELECT
          product_id,
          COUNT(*) AS variant_count,
          SUM(price > 0) AS price_count
        FROM product_variants
        GROUP BY product_id
      ) v ON v.product_id = p.id
      LEFT JOIN (
        SELECT product_id, COUNT(*) AS image_count
        FROM product_images
        GROUP BY product_id
      ) i ON i.product_id = p.id
      WHERE p.business_id = 1
    `);
    console.table(summary);
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error("Audit gagal:", err.code || err.message);
  process.exitCode = 1;
});
