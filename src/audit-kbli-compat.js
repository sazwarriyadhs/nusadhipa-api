const pool = require("./db");

async function main() {
  const db = process.env.DB_NAME || "nusadhipa_marketplace";

  const [tables] = await pool.query(`
    SELECT TABLE_NAME, ENGINE, TABLE_COLLATION
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME IN (
        'businesses', 'users', 'categories',
        'ref_kbli_codes', 'business_kbli_codes',
        'catalog_category_kbli'
      )
    ORDER BY TABLE_NAME
  `, [db]);

  console.log("\n=== TABLES ===");
  console.table(tables);

  const [columns] = await pool.query(`
    SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE,
           IS_NULLABLE, CHARACTER_SET_NAME, COLLATION_NAME,
           COLUMN_KEY, EXTRA
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ?
      AND (
        (TABLE_NAME = 'businesses' AND COLUMN_NAME = 'id')
        OR (TABLE_NAME = 'users' AND COLUMN_NAME = 'id')
        OR (TABLE_NAME = 'categories' AND COLUMN_NAME IN ('id', 'parent_id'))
      )
    ORDER BY TABLE_NAME, ORDINAL_POSITION
  `, [db]);

  console.log("\n=== FK TARGET COLUMNS ===");
  console.table(columns);

  const [constraints] = await pool.query(`
    SELECT TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME,
           REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = ?
      AND TABLE_NAME IN ('businesses', 'users', 'categories')
      AND REFERENCED_TABLE_NAME IS NOT NULL
    ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
  `, [db]);

  console.log("\n=== EXISTING FOREIGN KEYS ===");
  console.table(constraints);
}

main()
  .catch(err => {
    console.error("AUDIT FAILED:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });