const pool = require("./src/db");

const STORE_LAT = -6.595038;
const STORE_LNG = 106.816635;

const deliveries = [
  { order: "ORD-2026-0001", lat: -6.2607, lng: 106.7818 },  // Jakarta Selatan
  { order: "ORD-2026-0002", lat: -6.5940, lng: 106.7950 },  // Bogor Utara (dekat)
  { order: "ORD-2026-0003", lat: -6.4025, lng: 106.7942 },  // Depok
  { order: "ORD-2026-0004", lat: -6.9175, lng: 107.6191 },  // Bandung
  { order: "ORD-2026-0005", lat: -6.1783, lng: 106.6319 },  // Tangerang
];

function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

(async () => {
  try {
    console.log("=== 1. Update lokasi toko ===");
    await pool.execute(
      `UPDATE businesses SET 
        latitude = ?, longitude = ?, delivery_radius_km = ?
       WHERE id = 1`,
      [STORE_LAT, STORE_LNG, 5.0]
    );
    console.log(`✅ Toko: ${STORE_LAT}, ${STORE_LNG} (radius 5 km)`);

    console.log("\n=== 2. Update koordinat & jarak order ===");
    for (const d of deliveries) {
      const distance = haversine(STORE_LAT, STORE_LNG, d.lat, d.lng);
      const isFree = distance <= 5.0;
      
      await pool.execute(
        `UPDATE orders SET 
          shipping_lat = ?, shipping_lng = ?, shipping_distance_km = ?
         WHERE order_number = ?`,
        [d.lat, d.lng, distance.toFixed(2), d.order]
      );
      
      console.log(
        `  ${isFree ? "🎁" : "💰"} ${d.order}: ${distance.toFixed(2)} km${isFree ? " (GRATIS)" : ""}`
      );
    }

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
