require("dotenv").config();
const mysql = require("mysql2/promise");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "nusadhipa_marketplace"
  });

  try {
    const [rows] = await connection.execute(`
      SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE,
             IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN (
          'categories', 'products', 'product_variants',
          'product_images', 'inventory', 'businesses'
        )
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    console.log("DATABASE:", process.env.DB_NAME);
    console.log("TOTAL COLUMNS:", rows.length);

    for (const row of rows) {
      console.log(
        `${row.TABLE_NAME}.${row.COLUMN_NAME}` +
        ` | ${row.COLUMN_TYPE}` +
        ` | nullable=${row.IS_NULLABLE}` +
        ` | key=${row.COLUMN_KEY || "-"}` +
        ` | default=${row.COLUMN_DEFAULT ?? "NULL"}`
      );
    }
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error("Schema audit gagal:", error.code || error.message);
  process.exitCode = 1;
});
