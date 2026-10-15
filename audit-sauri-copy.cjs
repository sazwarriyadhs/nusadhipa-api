const db = require("./src/db");

async function main() {
  const [rows] = await db.execute(`
    SELECT id, name, short_description, description,
           weight_grams, status, published_at
    FROM products
    WHERE business_id = 1 AND id BETWEEN 1 AND 8
    ORDER BY id
  `);

  console.table(rows);
}

main()
  .catch(err => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
