const pool = require("./src/db");

const DEFAULT_PRICE = 10000;
const DEFAULT_STOCK = 100;

(async () => {
  try {
    console.log("=== Cari produk tanpa variant active ===");
    const [products] = await pool.execute(`
      SELECT p.id, p.name, p.slug
      FROM products p
      WHERE p.status = 'active'
        AND NOT EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active = 1
        )
    `);
    console.log(`Ditemukan: ${products.length} produk tanpa variant`);

    if (products.length === 0) {
      console.log("✅ Semua produk sudah punya variant.");
      process.exit(0);
    }

    // Cek struktur inventory
    console.log("\n=== Struktur inventory ===");
    try {
      const [invCols] = await pool.execute("DESCRIBE inventory");
      console.table(invCols);
    } catch (e) {
      console.log("(tabel inventory tidak ada atau error:", e.message, ")");
    }

    console.log("\n=== Insert variant untuk setiap produk ===");
    let inserted = 0;
    let skipped = 0;

    for (const product of products) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        const sku = `DEFAULT-${product.id}-${Date.now()}`;
        const variantName = "Default";

        const [result] = await conn.execute(
          `INSERT INTO product_variants
            (product_id, variant_name, sku, price, weight_grams, is_active, selling_unit, quantity_step)
           VALUES (?, ?, ?, ?, ?, 1, 'unit', 1.000)`,
          [product.id, variantName, sku, DEFAULT_PRICE, 1000]
        );

        const variantId = result.insertId;

        // Coba insert inventory kalau tabelnya ada
        try {
          await conn.execute(
            `INSERT INTO inventory (variant_id, quantity_on_hand, quantity_reserved)
             VALUES (?, ?, 0)`,
            [variantId, DEFAULT_STOCK]
          );
        } catch (invErr) {
          // Kalau kolom/tabel beda, skip saja
          if (!invErr.message.includes("Unknown") && !invErr.message.includes("doesn't exist")) {
            throw invErr;
          }
        }

        await conn.commit();
        inserted++;
      } catch (err) {
        await conn.rollback();
        console.error(`❌ Gagal insert variant untuk ${product.name}:`, err.message);
        skipped++;
      } finally {
        conn.release();
      }
    }

    console.log(`\n✅ Berhasil: ${inserted} variant ditambahkan`);
    console.log(`❌ Gagal: ${skipped}`);

    // Verifikasi
    console.log("\n=== Verifikasi ===");
    const [check] = await pool.execute(`
      SELECT COUNT(DISTINCT p.id) AS total_with_variant
      FROM products p
      WHERE p.status = 'active'
        AND EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active = 1
        )
    `);
    console.table(check);

    process.exit(0);
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
  }
})();
