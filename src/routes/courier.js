const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/v1/courier/routes — generate rute dari orders nyata (group by jarak)
router.get("/routes", async (req, res) => {
  try {
    const [orders] = await db.execute(`
      SELECT o.id, o.order_number, o.shipping_address, o.shipping_lat, o.shipping_lng,
             o.shipping_distance_km, o.shipping_total, o.status
      FROM orders o
      WHERE o.status IN ('paid', 'processing')
        AND NOT EXISTS (
          SELECT 1 FROM courier_routes cr 
          WHERE JSON_CONTAINS(cr.order_ids, CAST(o.id AS JSON))
        )
      ORDER BY o.created_at ASC
    `);

    if (orders.length === 0) return res.json({ success: true, data: [] });

    // Group by jarak (dekat/jauh)
    const grouped = new Map();
    for (const order of orders) {
      const distance = parseFloat(order.shipping_distance_km) || 0;
      const category = distance <= 5 ? "Dekat" : "Jauh";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(order);
    }

    // Generate rute
    const routes = [];
    let code = 65;
    for (const [category, areaOrders] of grouped) {
      const routeCode = String.fromCharCode(code++);
      const isDekat = category === "Dekat";
      const feePerOrder = isDekat ? 5000 : 7000;
      const baseFee = isDekat ? 10000 : 20000;
      const totalDistance = areaOrders.reduce((sum, o) => sum + (parseFloat(o.shipping_distance_km) || 0), 0);
      const totalWeight = areaOrders.reduce((sum, o) => sum + (parseFloat(o.shipping_distance_km) || 1), 0);
      const fee = baseFee + (areaOrders.length * feePerOrder) + Math.round(totalDistance * 500);

      const [result] = await db.execute(
        "INSERT INTO courier_routes (route_code, area, order_ids, customers, weight_kg, fee, status) VALUES (?, ?, ?, ?, ?, ?, 'available')",
        [routeCode, category, JSON.stringify(areaOrders.map(o => o.id)), areaOrders.length, totalWeight.toFixed(2), fee]
      );

      routes.push({
        id: result.insertId,
        route_code: routeCode,
        area: category,
        customers: areaOrders.length,
        weight_kg: totalWeight.toFixed(2),
        fee,
        status: "available",
      });
    }

    res.json({ success: true, data: routes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/courier/routes/:id/claim — klaim rute
router.post("/routes/:id/claim", async (req, res) => {
  const { id } = req.params;
  const { courier_id } = req.body;
  if (!courier_id) return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  try {
    const [result] = await db.execute(
      "UPDATE courier_routes SET status = 'taken', courier_id = ?, claimed_at = NOW() WHERE id = ? AND status = 'available'",
      [courier_id, id]
    );
    if (result.affectedRows === 0) return res.status(409).json({ success: false, message: "Rute sudah diambil kurir lain" });
    await db.execute("INSERT INTO courier_claims (route_id, courier_id) VALUES (?, ?)", [id, courier_id]);
    res.json({ success: true, message: "Rute berhasil diambil" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/courier/routes/mine — rute aktif kurir
router.get("/routes/mine", async (req, res) => {
  const { courier_id } = req.query;
  if (!courier_id) return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  try {
    const [rows] = await db.execute(
      "SELECT id, route_code, area, customers, weight_kg, fee, status, claimed_at FROM courier_routes WHERE courier_id = ? AND status IN ('taken','completed') ORDER BY claimed_at DESC",
      [courier_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/v1/courier/routes/:id/complete — selesai rute
router.post("/routes/:id/complete", async (req, res) => {
  const { id } = req.params;
  const { courier_id } = req.body;
  if (!courier_id) return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  try {
    const [rows] = await db.execute("SELECT fee FROM courier_routes WHERE id = ? AND courier_id = ? AND status = 'taken'", [id, courier_id]);
    if (rows.length === 0) return res.status(404).json({ success: false, message: "Rute tidak ditemukan / bukan milik Anda" });
    const fee = rows[0].fee;
    await db.execute("UPDATE courier_routes SET status = 'completed', completed_at = NOW() WHERE id = ?", [id]);
    await db.execute("INSERT INTO courier_earnings (courier_id, route_id, amount, status) VALUES (?, ?, ?, 'available')", [courier_id, id, fee]);
    res.json({ success: true, message: "Rute selesai. Fee masuk ke saldo." });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/courier/earnings — riwayat pendapatan
router.get("/earnings", async (req, res) => {
  const { courier_id } = req.query;
  if (!courier_id) return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  try {
    const [rows] = await db.execute(
      "SELECT e.id, e.route_id, e.amount, e.status, e.created_at, e.paid_at, r.route_code, r.area FROM courier_earnings e LEFT JOIN courier_routes r ON e.route_id = r.id WHERE e.courier_id = ? ORDER BY e.created_at DESC",
      [courier_id]
    );
    const [summary] = await db.execute(
      "SELECT COALESCE(SUM(CASE WHEN status='available' THEN amount ELSE 0 END),0) AS available_balance, COALESCE(SUM(CASE WHEN status='pending' THEN amount ELSE 0 END),0) AS pending_balance, COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) AS total_paid FROM courier_earnings WHERE courier_id = ?",
      [courier_id]
    );
    res.json({ success: true, data: rows, summary: summary[0] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/courier/deliveries — riwayat rute selesai
router.get("/deliveries", async (req, res) => {
  const { courier_id } = req.query;
  if (!courier_id) return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  try {
    const [rows] = await db.execute(
      "SELECT id, route_code, area, customers, weight_kg, fee, status, claimed_at, completed_at FROM courier_routes WHERE courier_id = ? AND status = 'completed' ORDER BY completed_at DESC",
      [courier_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

