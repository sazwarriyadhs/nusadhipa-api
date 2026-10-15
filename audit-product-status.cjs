require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "nusadhipa_marketplace",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  try {
    const [columns] = await db.execute("SHOW COLUMNS FROM products");
    console.log("Kolom relevan:", columns
      .map(c => c.Field)
      .filter(n => /status|business_id|category_id|published|deleted|is_active/i.test(n)));

    const [rows] = await db.execute(
      "SELECT status, COUNT(*) AS jumlah FROM products WHERE business_id = 1 GROUP BY status"
    );
    console.table(rows);

    const [sample] = await db.execute(
      "SELECT id, name, status, category_id, business_id FROM products WHERE business_id = 1 ORDER BY id LIMIT 10"
    );
    console.table(sample);
  } finally {
    await db.end();
  }
})().catch(e => {
  console.error("Audit gagal:", e.message);
  process.exitCode = 1;
});
