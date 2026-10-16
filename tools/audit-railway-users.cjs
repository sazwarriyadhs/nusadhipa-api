const mysql = require("mysql2/promise");
const readline = require("readline");

(async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const password = await new Promise(resolve =>
    rl.question("Password Railway: ", resolve)
  );
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

    const [columns] = await conn.execute(`
      SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'users'
      ORDER BY ORDINAL_POSITION
    `);

    console.log("\n=== STRUKTUR USERS ===");
    console.table(columns);

    const [users] = await conn.execute("SELECT * FROM users LIMIT 8");
    console.log("\n=== SAMPLE USERS (maksimal 8 baris) ===");
    console.table(users.map(u => {
      const copy = { ...u };
      for (const key of Object.keys(copy)) {
        if (/password|token|secret/i.test(key)) copy[key] = "[DISEMBUNYIKAN]";
      }
      return copy;
    }));
  } catch (err) {
    console.error("AUDIT GAGAL:", err.message);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
