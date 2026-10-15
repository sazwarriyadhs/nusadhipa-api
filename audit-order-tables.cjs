const db = require("./src/db");

async function main() {
  const [rows] = await db.execute(`
    SELECT TABLE_NAME
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND (
        TABLE_NAME LIKE '%order%'
        OR TABLE_NAME LIKE '%cart%'
        OR TABLE_NAME LIKE '%payment%'
      )
    ORDER BY TABLE_NAME
  `);
  console.table(rows);
}

main()
  .catch(e => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => db.end());
