const pool = require("./src/db");

(async () => {
  try {
    console.log("=== Cek kolom existing ===");
    const [bizCols] = await pool.execute("DESCRIBE businesses");
    const bizFields = bizCols.map(c => c.Field);

    const [orderCols] = await pool.execute("DESCRIBE orders");
    const orderFields = orderCols.map(c => c.Field);

    const statements = [];

    // Businesses
    if (!bizFields.includes("latitude"))
      statements.push("ALTER TABLE businesses ADD COLUMN latitude DECIMAL(10, 8) NULL");
    if (!bizFields.includes("longitude"))
      statements.push("ALTER TABLE businesses ADD COLUMN longitude DECIMAL(11, 8) NULL");
    if (!bizFields.includes("delivery_radius_km"))
      statements.push("ALTER TABLE businesses ADD COLUMN delivery_radius_km DECIMAL(5, 2) DEFAULT 5.00");

    // Orders
    if (!orderFields.includes("shipping_lat"))
      statements.push("ALTER TABLE orders ADD COLUMN shipping_lat DECIMAL(10, 8) NULL");
    if (!orderFields.includes("shipping_lng"))
      statements.push("ALTER TABLE orders ADD COLUMN shipping_lng DECIMAL(11, 8) NULL");
    if (!orderFields.includes("shipping_distance_km"))
      statements.push("ALTER TABLE orders ADD COLUMN shipping_distance_km DECIMAL(8, 2) NULL");

    if (statements.length === 0) {
      console.log("✅ Semua kolom sudah ada");
      process.exit(0);
    }

    console.log(`\n=== Menambah ${statements.length} kolom ===`);
    for (const sql of statements) {
      console.log("  →", sql);
      await pool.execute(sql);
    }
    console.log("\n✅ Selesai");

    // Verifikasi
    const [newBiz] = await pool.execute("DESCRIBE businesses");
    console.log("\n=== Businesses (kolom lokasi) ===");
    console.table(
      newBiz
        .filter(c => ["latitude", "longitude", "delivery_radius_km"].includes(c.Field))
        .map(c => ({ Field: c.Field, Type: c.Type }))
    );

    const [newOrder] = await pool.execute("DESCRIBE orders");
    console.log("\n=== Orders (kolom lokasi) ===");
    console.table(
      newOrder
        .filter(c => ["shipping_lat", "shipping_lng", "shipping_distance_km"].includes(c.Field))
        .map(c => ({ Field: c.Field, Type: c.Type }))
    );

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
