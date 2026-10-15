require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "nusadhipa_marketplace",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  try {
    const [rows] = await db.execute(`
      SELECT p.id, p.name, p.category_id, c.name AS category_name,
             p.status,
             (SELECT COUNT(*) FROM product_images pi
              WHERE pi.product_id = p.id) AS image_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.business_id = 1
        AND (
          LOWER(p.name) REGEXP 'ikan|fish|fillet|potong|seafood|tawar|laut'
          OR LOWER(p.name) REGEXP 'pakan|kucing|anjing|ternak|unggas'
          OR p.category_id IN (17, 23, 24, 25, 26)
        )
      ORDER BY p.category_id, p.id
    `);

    console.table(rows);
    console.log("Mode: READ ONLY — tidak ada perubahan database.");
  } finally {
    await db.end();
  }
}

main().catch(e => console.error(e.message));
