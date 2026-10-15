const pool = require("./src/db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const CUSTOMERS = [
  { name: "Budi Santoso", email: "budi.santoso@demo.local", password: "demo123" },
  { name: "Siti Nurhaliza", email: "siti.nurhaliza@demo.local", password: "demo123" },
  { name: "Ahmad Fauzi", email: "ahmad.fauzi@demo.local", password: "demo123" },
  { name: "Rina Wulandari", email: "rina.wulandari@demo.local", password: "demo123" },
  { name: "Hendra Wijaya", email: "hendra.wijaya@demo.local", password: "demo123" },
];

(async () => {
  try {
    console.log("=== Cek struktur users ===");
    const [cols] = await pool.execute("DESCRIBE users");
    console.table(cols.map(c => ({ Field: c.Field, Null: c.Null, Key: c.Key })));

    console.log("\n=== Buat user customer demo ===");
    for (const c of CUSTOMERS) {
      const [dup] = await pool.execute("SELECT id FROM users WHERE email = ?", [c.email]);
      if (dup.length > 0) {
        console.log(`  ⊘ ${c.email} (sudah ada, id=${dup[0].id})`);
        continue;
      }

      const hash = await bcrypt.hash(c.password, 10);
      const publicId = crypto.randomUUID();

      try {
        const [res] = await pool.execute(
          `INSERT INTO users (public_id, full_name, email, password_hash, status)
           VALUES (?, ?, ?, ?, 'active')`,
          [publicId, c.name, c.email, hash]
        );
        console.log(`  ✓ ${c.name} (id=${res.insertId})`);
      } catch (e) {
        // Coba tanpa status (kalau kolom tidak ada)
        try {
          const [res] = await pool.execute(
            `INSERT INTO users (public_id, full_name, email, password_hash)
             VALUES (?, ?, ?, ?)`,
            [publicId, c.name, c.email, hash]
          );
          console.log(`  ✓ ${c.name} (id=${res.insertId}, tanpa status)`);
        } catch (e2) {
          console.error(`  ❌ ${c.name}: ${e2.sqlMessage || e2.message}`);
        }
      }
    }

    // Verifikasi
    console.log("\n=== Semua users ===");
    const [rows] = await pool.execute(
      "SELECT id, public_id, full_name, email FROM users ORDER BY id"
    );
    console.table(rows);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
