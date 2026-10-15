require("dotenv").config();
const db = require("./src/db");

async function main() {
  try {
    console.log("\n=== AKUN PENGGUNA ===");
    const [users] = await db.query(`
      SELECT id, full_name, status, created_at
      FROM users
      ORDER BY id
    `);
    console.table(users);

    console.log("\n=== BISNIS TERDAFTAR ===");
    const [businesses] = await db.query(`
      SELECT
        b.id,
        b.owner_user_id,
        u.full_name AS owner_name,
        b.business_name,
        b.slug,
        b.business_type,
        b.province,
        b.city,
        b.verification_status,
        b.status
      FROM businesses b
      LEFT JOIN users u ON u.id = b.owner_user_id
      ORDER BY b.id
    `);
    console.table(businesses);

    console.log("\n=== JUMLAH DATA KATALOG ===");
    for (const table of [
      "products",
      "product_variants",
      "product_images",
      "business_kbli_codes",
      "catalog_category_kbli"
    ]) {
      try {
        const [rows] = await db.query(
          `SELECT COUNT(*) AS total FROM \`${table}\``
        );
        console.log(`${table}: ${rows[0].total}`);
      } catch (err) {
        if (err.code === "ER_NO_SUCH_TABLE") {
          console.log(`${table}: tabel belum tersedia`);
        } else {
          throw err;
        }
      }
    }
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error("Audit gagal:", err.code || err.message);
  process.exitCode = 1;
});
