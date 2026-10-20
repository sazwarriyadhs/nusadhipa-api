const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/v1/courier/routes
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

// POST /api/v1/courier/routes/:id/claim
router.post("/routes/:id/claim", async (req, res) => {
  const { id } = req.params;
  const { courier_id } = req.body;

  if (!courier_id) {
    return res.status(400).json({ success: false, message: "courier_id wajib diisi" });
  }

  try {
    const [result] = await db.execute(
      "UPDATE courier_routes SET status = 'taken', courier_id = ?, claimed_at = NOW() WHERE id = ? AND status = 'available'",
      [courier_id, id]
    );

    if (result.affectedRows === 0) {
      return res.status(409).json({ success: false, message: "Rute sudah diambil kurir lain" });
    }

    await db.execute(
      "INSERT INTO courier_claims (route_id, courier_id) VALUES (?, ?)",
      [id, courier_id]
    );

    res.json({ success: true, message: "Rute berhasil diambil" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
