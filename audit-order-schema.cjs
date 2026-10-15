const db = require("./src/db");

const tables = [
  "users",
  "businesses",
  "products",
  "product_variants",
  "inventory",
  "carts",
  "cart_items",
  "orders",
  "order_items",
  "payments"
];

async function main() {
  const [dbRows] = await db.query("SELECT DATABASE() AS db_name");
  const dbName = dbRows[0]?.db_name;

  console.log("Database aktif:", dbName);

  if (dbName !== "nusadhipa_marketplace") {
    throw new Error("Database tidak sesuai. Audit dihentikan.");
  }

  for (const table of tables) {
    const [exists] = await db.execute(
      "SELECT COUNT(*) AS total FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [table]
    );

    if (!exists[0].total) {
      console.log("\nTabel tidak ditemukan:", table);
      continue;
    }

    const [rows] = await db.query("SHOW CREATE TABLE `" + table + "`");
    console.log("\n=== " + table + " ===");
    console.log(rows[0]["Create Table"]);
  }
}

main()
  .catch((error) => {
    console.error("AUDIT GAGAL:", error.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
