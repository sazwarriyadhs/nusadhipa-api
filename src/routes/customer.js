const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/require-auth");

const router = express.Router();

// ============================================================
// GET /customer/wallet — Ambil saldo & poin customer
// ============================================================
router.get("/wallet", requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.userId;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Token tidak valid." });
    }

    const [rows] = await db.execute(
      "SELECT balance, points FROM wallets WHERE user_id = ? LIMIT 1",
      [userId]
    );

    if (!rows.length) {
      return res.json({ success: true, data: { balance: 0, points: 0 } });
    }

    res.json({
      success: true,
      data: {
        balance: parseFloat(rows[0].balance),
        points: rows[0].points,
      },
    });
  } catch (err) {
    console.error("[CUSTOMER WALLET] Error:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil wallet." });
  }
});

module.exports = router;
