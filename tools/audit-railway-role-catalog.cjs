const mysql = require("mysql2/promise");
const readline = require("readline");

(async () => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const password = await new Promise(resolve =>
    rl.question("Password Railway (input terlihat): ", resolve)
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

    const [roles] = await conn.execute(
      "SELECT id, role_key, role_name FROM roles ORDER BY id"
    );
    console.log("=== ROLE TERSEDIA ===");
    console.table(roles);

    const [assignments] = await conn.execute(`
      SELECT ur.user_id, ur.role_id, r.role_key, ur.assigned_by, ur.created_at
      FROM user_roles ur
      LEFT JOIN roles r ON r.id = ur.role_id
      ORDER BY ur.user_id, ur.role_id
    `);
    console.log("=== PENUGASAN ROLE ===");
    console.table(assignments);

    const [businessColumns] = await conn.execute(`
      SELECT COLUMN_NAME, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'businesses'
      ORDER BY ORDINAL_POSITION
    `);
    console.log("=== KOLOM BUSINESSES ===");
    console.table(businessColumns);
  } catch (err) {
    console.error("AUDIT GAGAL:", err.message);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
