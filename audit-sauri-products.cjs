require("dotenv").config();
const db = require("./src/db");

async function main() {
  try {
    const [columns] = await db.query(`
      SELECT COLUMN_NAME, COLUMN_TYPE
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
      ORDER BY ORDINAL_POSITION
    `);

    console.log("\n=== STRUKTUR PRODUCTS ===");
    console.table(columns);

    const names = columns.map(c => c.COLUMN_NAME);
    const ownerColumn = ["business_id", "owner_business_id"]
      .find(n => names.includes(n));

    if (ownerColumn) {
      console.log(`\n=== PRODUK PER ${ownerColumn} ===`);
      const [groups] = await db.query(
        `SELECT \`${ownerColumn}\` AS business_id,
                COUNT(*) AS total
         FROM products
         GROUP BY \`${ownerColumn}\`
         ORDER BY total DESC`
      );
      console.table(groups);
    } else {
      console.log(
        "\nKolom business_id tidak ditemukan; perlu audit relasi berdasarkan struktur aktual."
      );
    }

    const titleColumn = [
      "name", "product_name", "title"
    ].find(n => names.includes(n));

    const idColumn = names.includes("id") ? "id" : null;

    const safeColumns = [
      idColumn,
      ownerColumn,
      titleColumn,
      "status"
    ].filter(n => n && names.includes(n));

    if (safeColumns.length) {
      console.log("\n=== CONTOH MAKSIMAL 10 PRODUK ===");
      const selectList = safeColumns
        .map(n => `\`${n}\``)
        .join(", ");

      const [samples] = await db.query(
        `SELECT ${selectList} FROM products ORDER BY id LIMIT 10`
      );
      console.table(samples);
    }

    console.log("\n=== FOREIGN KEY PRODUCTS ===");
    const [fks] = await db.query(`
      SELECT COLUMN_NAME, REFERENCED_TABLE_NAME,
             REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'products'
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
