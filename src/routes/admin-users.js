const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/require-auth");
const requireRole = require("../middleware/require-role");

const router = express.Router();

router.post(
  "/admin/users/:id/activate",
  requireAuth,
  requireRole("superadmin"),
  async (req, res, next) => {
    const rawId = String(req.params.id || "");
    if (!/^[1-9]\d{0,19}$/.test(rawId)) {
      return res.status(400).json({
        success: false,
        message: "ID pengguna tidak valid."
      });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [users] = await conn.execute(
        `SELECT id, public_id, email, status
         FROM users WHERE id = ? FOR UPDATE`,
        [rawId]
      );

      if (!users.length) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: "Pengguna tidak ditemukan."
        });
      }

      const user = users[0];

      if (user.status !== "pending") {
        await conn.rollback();
        return res.status(409).json({
          success: false,
          message: "Hanya akun pending yang dapat diaktifkan.",
          currentStatus: user.status
        });
      }

      const [updated] = await conn.execute(
        `UPDATE users
         SET status = 'active', updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        [user.id]
      );

      if (updated.affectedRows !== 1) {
        throw new Error("Aktivasi tidak berhasil; status berubah bersamaan.");
      }

      await conn.execute(
        `INSERT INTO audit_logs
         (actor_user_id, action, entity_type, entity_id,
          before_data, after_data, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          req.user.id,
          "user.activate",
          "user",
          String(user.id),
          JSON.stringify({ status: "pending" }),
          JSON.stringify({ status: "active", public_id: user.public_id }),
          req.ip || null,
          String(req.get("user-agent") || "").slice(0, 500) || null
        ]
      );

      await conn.commit();

      return res.json({
        success: true,
        message: "Akun pengguna berhasil diaktifkan.",
        user: {
          id: String(user.id),
          publicId: user.public_id,
          email: user.email,
          status: "active"
        }
      });
    } catch (error) {
      try { await conn.rollback(); } catch (_) {}
      return next(error);
    } finally {
      conn.release();
    }
  }
);

module.exports = router;