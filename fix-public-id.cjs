const pool = require("./src/db");
const crypto = require("crypto");

(async () => {
  try {
    // Update public_id untuk user yang kosong
    const [emptyUsers] = await pool.execute(
      "SELECT id, full_name FROM users WHERE public_id = '' OR public_id IS NULL"
    );

    console.log(`=== Fix ${emptyUsers.length} user dengan public_id kosong ===`);
    for (const u of emptyUsers) {
      const uuid = crypto.randomUUID();
      await pool.execute(
        "UPDATE users SET public_id = ? WHERE id = ?",
        [uuid, u.id]
      );
      console.log(`  ✓ ${u.full_name} (id=${u.id}) → ${uuid}`);
    }

    // Verifikasi
    console.log("\n=== Semua user demo ===");
    const [rows] = await pool.execute(
      `SELECT id, public_id, full_name, email 
       FROM users 
       WHERE email LIKE '%@demo.local' 
       ORDER BY id`
    );
    console.table(rows);

    console.log("\n=== Semua user ===");
    const [all] = await pool.execute(
      "SELECT id, public_id, full_name, email FROM users ORDER BY id"
    );
    console.table(all);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
