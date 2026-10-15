const mysql = require("mysql2/promise");
require("dotenv").config();

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || "nusadhipa_marketplace",
  });

  try {
    const [rows] = await db.query(`
      SELECT
        (SELECT COUNT(*) FROM products) AS total_products,
        (SELECT COUNT(*) FROM businesses) AS total_businesses,
        (SELECT COUNT(*) FROM categories WHERE status = 'active') AS active_categories,
        (SELECT COUNT(*) FROM products WHERE status = 'active') AS active_products,
        (SELECT COUNT(*) FROM businesses WHERE status = 'active') AS active_businesses
    `);
    console.table(rows);
  } finally {
    await db.end();
  }
})().catch((err) => {
  console.error("Audit gagal:", err.code || err.message);
  process.exitCode = 1;
});
