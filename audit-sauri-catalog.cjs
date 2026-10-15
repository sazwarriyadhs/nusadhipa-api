const db = require("./src/db");

async function main() {
  const [businesses] = await db.execute(`
    SELECT id, business_name, status, verification_status
    FROM businesses
    WHERE id = 1
  `);

  const [products] = await db.execute(`
    SELECT
      p.id,
      p.name,
      p.slug,
      p.status AS product_status,
      c.status AS category_status,
      COUNT(DISTINCT pv.id) AS active_variants,
      COUNT(DISTINCT pi.id) AS images,
      MIN(pv.price) AS min_price,
      MAX(pv.price) AS max_price
    FROM products p
    JOIN categories c ON c.id = p.category_id
    LEFT JOIN product_variants pv
      ON pv.product_id = p.id AND pv.is_active = 1
    LEFT JOIN product_images pi ON pi.product_id = p.id
    WHERE p.business_id = 1
      AND p.id BETWEEN 1 AND 8
    GROUP BY
      p.id, p.name, p.slug, p.status, c.status
    ORDER BY p.id
  `);

  console.log("\n=== STATUS TENANT SAURI ===");
  console.table(businesses);

  console.log("\n=== AUDIT 8 PRODUK AWAL ===");
  console.table(products);
}

main()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
