const mysql = require("mysql2/promise");
const readline = require("readline");

(async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const password = await new Promise(resolve => {
    rl.question("Password Railway (input terlihat): ", resolve);
  });
  rl.close();

  let conn;
  try {
    conn = await mysql.createConnection({
      host: "tokaido.proxy.rlwy.net",
      port: 47958,
      user: "root",
      password,
      database: "railway",
      ssl: { rejectUnauthorized: false }
    });

    const [tables] = await conn.execute(`
      SELECT TABLE_NAME
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `);

    console.log("\n=== TABEL TERKAIT AKUN / ROLE / TENANT ===");
    console.table(tables.filter(({ TABLE_NAME }) =>
      /user|role|permission|member|tenant|business|customer|account|owner/i.test(TABLE_NAME)
    ));

    const [columns] = await conn.execute(`
      SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND (
          COLUMN_NAME LIKE '%user%'
          OR COLUMN_NAME LIKE '%role%'
          OR COLUMN_NAME LIKE '%tenant%'
          OR COLUMN_NAME LIKE '%business%'
          OR COLUMN_NAME LIKE '%customer%'
        )
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    console.log("\n=== KOLOM RELASI ===");
    console.table(columns);
  } catch (err) {
    console.error("AUDIT GAGAL:", err.message);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
