const db = require("./src/db");

async function main() {
  for (const table of ["users", "inventory", "product_variants"]) {
    console.log(`\n=== ${table} ===`);
    const [rows] = await db.execute(`SHOW COLUMNS FROM \`${table}\``);
    console.table(rows.map(r => ({
      field: r.Field,
      type: r.Type,
      nullable: r.Null,
      key: r.Key,
      default: r.Default
    })));
  }
}

main()
  .catch(e => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
