const pool = require("./src/db");

(async () => {
  try {
    console.log("=== Sebelum ===");
    const [before] = await pool.execute(
      `SELECT id, full_name, email FROM users 
       WHERE email LIKE '%@demo.local' OR email = ?
       ORDER BY id`,
      ["dreamonhouse@gmail.com"]
    );
    console.table(before);

    // Cek apakah email baru sudah dipakai
    const [dup] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      ["dreamonhouse@gmail.com"]
    );
    if (dup.length > 0) {
      console.log("⚠️ Email sudah dipakai user id:", dup[0].id);
      process.exit(1);
    }

    // Update email
    const [result] = await pool.execute(
      "UPDATE users SET email = ? WHERE email = ?",
      ["dreamonhouse@gmail.com", "siti.nurhaliza@demo.local"]
    );
    console.log(`\n✅ ${result.affectedRows} user updated`);

    // Verifikasi
    console.log("\n=== Sesudah ===");
    const [after] = await pool.execute(
      "SELECT id, full_name, email FROM users ORDER BY id"
    );
    console.table(after);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
