const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/v1/courier/routes — daftar rute tersedia
router.get("/routes", async (req, res) => {
  try {
    const [rows] = await db.execute(
      "SELECT id, route_code, area, customers, weight_kg, fee, status FROM courier_routes WHERE status = 'available' ORDER BY route_code"
    );
    res.json({ success: true, data: rows });
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
