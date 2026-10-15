const pool = require("./src/db");

(async () => {
  try {
    console.log("=== SEBELUM: status produk ===");
    const [before] = await pool.execute(
      "SELECT status, COUNT(*) AS n FROM products GROUP BY status"
    );
    console.table(before);

    console.log("\n=== Update draft → active ===");
    const [result] = await pool.execute(
      "UPDATE products SET status='active', published_at=NOW() WHERE status='draft'"
    );
    console.log(`✅ Updated: ${result.affectedRows} produk`);

    console.log("\n=== SESUDAH: status produk ===");
    const [after] = await pool.execute(
      "SELECT status, COUNT(*) AS n FROM products GROUP BY status"
    );
    console.table(after);

    console.log("\n=== Produk per kategori (active) ===");
    const [byCat] = await pool.execute(
      `SELECT c.slug, COUNT(p.id) AS n
       FROM categories c
       LEFT JOIN products p ON p.category_id = c.id AND p.status = 'active'
       GROUP BY c.slug
       HAVING n > 0
       ORDER BY n DESC`
    );
    console.table(byCat);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
