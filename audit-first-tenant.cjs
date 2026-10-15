require("dotenv").config();
const db = require("./src/db");

async function main() {
  try {
    const [identity] = await db.query(`
      SELECT DATABASE() AS database_name,
             CURRENT_USER() AS db_account
    `);

    console.log("\n=== KONEKSI API ===");
    console.table(identity);

    for (const table of ["users", "businesses"]) {
      console.log(`\n=== STRUKTUR ${table} ===`);

      const [columns] = await db.query(
        `SHOW COLUMNS FROM \`${table}\``
      );

      console.table(columns.map(c => ({
        field: c.Field,
        type: c.Type,
        nullable: c.Null,
        key: c.Key,
        default: c.Default,
      })));

      const [counts] = await db.query(
        `SELECT COUNT(*) AS total FROM \`${table}\``
      );

      console.log("Total baris:", counts[0].total);
    }

    console.log("\n=== FOREIGN KEY BUSINESSES ===");

    const [fks] = await db.query(`
      SELECT COLUMN_NAME, REFERENCED_TABLE_NAME,
             REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'businesses'
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `);

    console.table(fks);
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error("Audit gagal:", err.code || err.message);
  process.exitCode = 1;
});
