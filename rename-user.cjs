const pool = require("./src/db");

const OLD_NAME = "Siti Nurhaliza";
const NEW_NAME = "Azwar Riyadh";
const NEW_ADDRESS = {
  name: NEW_NAME,
  phone: "081234567890",
  address: "Cimahpar Stoneyard Bogor Blok E No 1, RT 03 RW 04",
  city: "Bogor Utara",
  province: "Jawa Barat",
  postal_code: "16155",
};

(async () => {
  try {
    console.log("=== Sebelum ===");
    const [before] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, o.order_number, o.shipping_address
       FROM users u
       LEFT JOIN orders o ON o.buyer_user_id = u.id
       WHERE u.full_name = ?`,
      [OLD_NAME]
    );
    console.table(before);

    // 1. Update user
    const [userResult] = await pool.execute(
      "UPDATE users SET full_name = ? WHERE full_name = ?",
      [NEW_NAME, OLD_NAME]
    );
    console.log(`\n✅ User updated: ${userResult.affectedRows} baris`);

    // 2. Update alamat di orders
    const newAddressJson = JSON.stringify(NEW_ADDRESS);
    const [orderResult] = await pool.execute(
      `UPDATE orders o
       JOIN users u ON u.id = o.buyer_user_id
       SET o.shipping_address = ?
       WHERE u.full_name = ?`,
      [newAddressJson, NEW_NAME]
    );
    console.log(`✅ Order address updated: ${orderResult.affectedRows} baris`);

    // 3. Verifikasi
    console.log("\n=== Sesudah ===");
    const [after] = await pool.execute(
      `SELECT u.id, u.full_name, u.email, o.order_number, o.shipping_address
       FROM users u
       LEFT JOIN orders o ON o.buyer_user_id = u.id
       WHERE u.full_name = ?`,
      [NEW_NAME]
    );
    console.table(after);

    console.log("\n=== Semua customer demo ===");
    const [all] = await pool.execute(
      `SELECT id, full_name, email FROM users 
       WHERE email LIKE '%@demo.local' 
       ORDER BY id`
    );
    console.table(all);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
