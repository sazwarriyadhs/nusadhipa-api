const db = require("./src/db");

async function main() {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    const [businesses] = await conn.execute(`
      SELECT id, status, verification_status
      FROM businesses
      WHERE id = 1
      FOR UPDATE
    `);

    if (businesses.length !== 1) {
      throw new Error("Tenant SAURI ID 1 tidak ditemukan.");
    }

    const [products] = await conn.execute(`
      SELECT p.id
      FROM products p
      JOIN categories c ON c.id = p.category_id
      WHERE p.business_id = 1
        AND p.id BETWEEN 1 AND 8
        AND c.status = 'active'
        AND EXISTS (
          SELECT 1 FROM product_variants pv
          WHERE pv.product_id = p.id AND pv.is_active = 1
        )
        AND EXISTS (
          SELECT 1 FROM product_images pi
          WHERE pi.product_id = p.id
        )
      FOR UPDATE
    `);

    if (products.length !== 8) {
      throw new Error(
        `Dibatalkan: hanya ${products.length}/8 produk lolos pemeriksaan.`
      );
    }

    await conn.execute(`
      UPDATE businesses
      SET status = 'active'
      WHERE id = 1
    `);

    await conn.execute(`
      UPDATE products
      SET status = 'active',
          published_at = COALESCE(published_at, NOW())
      WHERE business_id = 1
        AND id BETWEEN 1 AND 8
    `);

    const [checkBusiness] = await conn.execute(`
      SELECT id, business_name, status, verification_status
      FROM businesses
      WHERE id = 1
    `);

    const [checkProducts] = await conn.execute(`
      SELECT id, name, status, published_at
      FROM products
      WHERE business_id = 1
        AND id BETWEEN 1 AND 8
      ORDER BY id
    `);

    if (
      checkBusiness[0].status !== "active" ||
      checkBusiness[0].verification_status !== "unverified" ||
      checkProducts.length !== 8 ||
      checkProducts.some(p => p.status !== "active")
    ) {
      throw new Error("Pemeriksaan akhir gagal; transaksi dibatalkan.");
    }

    await conn.commit();

    console.log("\n=== TENANT SAURI ===");
    console.table(checkBusiness);
    console.log("\n=== PRODUK YANG DIAKTIFKAN ===");
    console.table(checkProducts);
    console.log("\nBerhasil: tenant dan 8 produk aktif.");
    console.log("Status verifikasi legalitas tidak diubah.");
  } catch (err) {
    await conn.rollback();
    console.error("TRANSAKSI DIBATALKAN:", err.message);
    process.exitCode = 1;
  } finally {
    conn.release();
    await db.end();
  }
}

main().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
});
