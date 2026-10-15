const pool = require("./src/db");

const FREE_RADIUS_KM = 5.0;
const BASE_COST = 5000;
const COST_PER_KM = 2000;

function calculateShipping(distanceKm) {
  if (distanceKm <= FREE_RADIUS_KM) return 0;
  return BASE_COST + (distanceKm - FREE_RADIUS_KM) * COST_PER_KM;
}

(async () => {
  try {
    console.log("=== Update ongkir sesuai jarak ===");
    
    const [orders] = await pool.execute(
      `SELECT id, order_number, shipping_distance_km, subtotal
       FROM orders ORDER BY id`
    );

    for (const o of orders) {
      const distance = Number(o.shipping_distance_km) || 0;
      const newShipping = Math.round(calculateShipping(distance));
      const newGrand = Number(o.subtotal) + newShipping;

      await pool.execute(
        `UPDATE orders SET shipping_total = ?, grand_total = ? WHERE id = ?`,
        [newShipping, newGrand, o.id]
      );

      const icon = newShipping === 0 ? "🎁" : "💰";
      console.log(
        `  ${icon} ${o.order_number}: ${distance.toFixed(2)} km → Rp ${newShipping.toLocaleString("id-ID")}`
      );
    }

    console.log("\n=== Verifikasi ===");
    const [rows] = await pool.execute(
      `SELECT 
        order_number,
        shipping_distance_km AS distance,
        subtotal,
        shipping_total AS ongkir,
        grand_total
       FROM orders ORDER BY id`
    );
    console.table(rows);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
