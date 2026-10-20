const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

// ============================================================
// ROUTES (Generate dari Orders Nyata)
// ============================================================
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

    const grouped = new Map();
    for (const order of orders) {
      const distance = parseFloat(order.shipping_distance_km) || 0;
      const category = distance <= 5 ? "Dekat" : "Jauh";
      if (!grouped.has(category)) grouped.set(category, []);
      grouped.get(category).push(order);
    }

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
        id: result.insertId, route_code: routeCode, area: category,
        customers: areaOrders.length, weight_kg: totalWeight.toFixed(2), fee, status: "available",
      });
    }

    res.json({ success: true, data: routes });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// CLAIM (Klaim Rute)
// ============================================================
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
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// MY ROUTES (Rute Aktif)
// ============================================================
router.get("/routes/mine", async (req, res) => {
  const { courier_id } = req.query;
  if (!courier_id) return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  try {
    const [rows] = await db.execute(
      "SELECT id, route_code, area, customers, weight_kg, fee, status, claimed_at FROM courier_routes WHERE courier_id = ? AND status IN ('taken','completed') ORDER BY claimed_at DESC",
      [courier_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// COMPLETE (Selesaikan Rute)
// ============================================================
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
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// EARNINGS (Riwayat Pendapatan)
// ============================================================
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
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// DELIVERIES (Riwayat Rute Selesai)
// ============================================================
router.get("/deliveries", async (req, res) => {
  const { courier_id } = req.query;
  if (!courier_id) return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  try {
    const [rows] = await db.execute(
      "SELECT id, route_code, area, customers, weight_kg, fee, status, claimed_at, completed_at FROM courier_routes WHERE courier_id = ? AND status = 'completed' ORDER BY completed_at DESC",
      [courier_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// PAYOUTS (Ajukan & Riwayat Pencairan)
// ============================================================
router.post("/payouts", async (req, res) => {
  const { courier_id, method, account_number } = req.body;
  if (!courier_id || !method || !account_number) {
    return res.status(400).json({ success: false, message: "Data pencairan tidak lengkap" });
  }
  try {
    const [summary] = await db.execute(
      "SELECT COALESCE(SUM(amount), 0) AS available_balance FROM courier_earnings WHERE courier_id = ? AND status = 'available'",
      [courier_id]
    );
    const amount = Number(summary[0].available_balance);
    if (amount <= 0) return res.status(400).json({ success: false, message: "Saldo tidak mencukupi" });

    const [result] = await db.execute(
      "INSERT INTO courier_payouts (courier_id, amount, method, account_number) VALUES (?, ?, ?, ?)",
      [courier_id, amount, method, account_number]
    );

    await db.execute(
      "UPDATE courier_earnings SET status = 'paid', paid_at = NOW() WHERE courier_id = ? AND status = 'available'",
      [courier_id]
    );

    res.json({ success: true, message: "Pencairan diajukan", payout_id: result.insertId, amount });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

router.get("/payouts", async (req, res) => {
  const { courier_id } = req.query;
  if (!courier_id) return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  try {
    const [rows] = await db.execute(
      "SELECT * FROM courier_payouts WHERE courier_id = ? ORDER BY requested_at DESC",
      [courier_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// REGISTER (Kurir Baru)
// ============================================================
router.post("/register", async (req, res) => {
  const { name, email, phone, password, vehicle_type, plate_number, city, payout_method, payout_account } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ success: false, message: "Nama, email, password wajib diisi" });
  }
  try {
    const [existing] = await db.execute("SELECT id FROM couriers WHERE email = ?", [email]);
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: "Email sudah terdaftar" });
    }
    const hash = await bcrypt.hash(password, 10);
    const publicId = crypto.randomUUID();
    const [result] = await db.execute(
      "INSERT INTO couriers (public_id, name, email, phone, password_hash, vehicle_type, plate_number, city, payout_method, payout_account, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')",
      [publicId, name, email, phone || null, hash, vehicle_type || null, plate_number || null, city || null, payout_method || null, payout_account || null]
    );
    res.json({ success: true, message: "Pendaftaran berhasil. Tunggu verifikasi admin.", courier_id: result.insertId });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ============================================================
// LOGIN (Kurir)
// ============================================================
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: "Email & password wajib diisi" });
  }
  try {
    const [rows] = await db.execute("SELECT * FROM couriers WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Email atau password salah" });
    }
    const courier = rows[0];
    const valid = await bcrypt.compare(password, courier.password_hash);
    if (!valid) {
      return res.status(401).json({ success: false, message: "Email atau password salah" });
    }
    if (courier.status !== "approved") {
      return res.status(403).json({ success: false, message: "Akun belum diverifikasi admin" });
    }
    const token = jwt.sign(
      { id: courier.id, public_id: courier.public_id, email: courier.email, role: "courier" },
      process.env.JWT_SECRET || "nusadhipa-dev-secret",
      { expiresIn: "7d" }
    );
    res.json({
      success: true, message: "Login berhasil", token,
      courier: { id: courier.id, public_id: courier.public_id, name: courier.name, email: courier.email, city: courier.city, status: courier.status },
    });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
