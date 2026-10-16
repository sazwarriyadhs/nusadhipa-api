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

    const [roles] = await conn.execute(`
      SELECT u.id, u.full_name, u.email, u.status,
             r.role_key, r.role_name
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      ORDER BY u.id, r.role_key
    `);
    console.log("\n=== AKUN DAN ROLE ===");
    console.table(roles);

    const [businesses] = await conn.execute(`
      SELECT b.id AS business_id, b.business_name, b.business_type,
             b.owner_user_id, u.full_name AS owner_name, u.email AS owner_email
      FROM businesses b
      LEFT JOIN users u ON u.id = b.owner_user_id
      ORDER BY b.id
    `);
    console.log("\n=== PEMILIK BISNIS ===");
    console.table(businesses);

    const [schema] = await conn.execute(`
      SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME IN ('roles', 'user_roles')
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);
    console.log("\n=== STRUKTUR RBAC ===");
    console.table(schema);
  } catch (err) {
    console.error("AUDIT GAGAL:", err.message);
    process.exitCode = 1;
  } finally {
    if (conn) await conn.end();
  }
})();
