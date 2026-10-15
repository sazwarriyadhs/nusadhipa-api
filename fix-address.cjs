const pool = require("./src/db");

(async () => {
  try {
    console.log("=== Sebelum ===");
    const [before] = await pool.execute(
      "SELECT id, order_number, shipping_address FROM orders LIMIT 3"
    );
    console.table(before);

    const [result] = await pool.execute(
      `UPDATE orders 
       SET shipping_address = REPLACE(shipping_address, 'Ji. Contoh', 'Jl. Contoh') 
       WHERE shipping_address LIKE '%Ji. Contoh%'`
    );
    console.log(`\n✅ ${result.affectedRows} alamat diperbaiki`);

    console.log("\n=== Sesudah ===");
    const [after] = await pool.execute(
      "SELECT id, order_number, shipping_address FROM orders LIMIT 3"
    );
    console.table(after);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
