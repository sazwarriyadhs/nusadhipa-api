const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/require-auth");
const requireRole = require("../middleware/require-role");

const router = express.Router();

function parseJson(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch (_) { return value; }
}

router.get(
  "/settings",
  requireAuth,
  requireRole("superadmin"),
  async (_req, res, next) => {
    try {
      const [rows] = await pool.execute(
        `SELECT setting_key, setting_value, description,
                is_public, updated_by, updated_at
         FROM platform_settings
         ORDER BY setting_key`
      );

      return res.json({
        success: true,
        settings: rows.map((row) => ({
          key: row.setting_key,
          value: parseJson(row.setting_value),
          description: row.description,
          isPublic: Boolean(row.is_public),
          updatedBy: row.updated_by == null ? null : String(row.updated_by),
          updatedAt: row.updated_at
        }))
      });
    } catch (error) {
      return next(error);
    }
  }
);

router.put(
  "/settings/:key",
  requireAuth,
  requireRole("superadmin"),
  async (req, res, next) => {
    const key = String(req.params.key || "");
    if (!/^[a-zA-Z0-9._-]{1,150}$/.test(key)) {
      return res.status(400).json({
        success: false,
        message: "Kunci pengaturan tidak valid."
      });
    }

    if (!req.body || !Object.prototype.hasOwnProperty.call(req.body, "value")) {
      return res.status(400).json({
        success: false,
        message: "Properti value wajib dikirim."
      });
    }

    let encodedValue;
    try {
      encodedValue = JSON.stringify(req.body.value);
      if (encodedValue === undefined) throw new Error("Invalid JSON value");
    } catch (_) {
      return res.status(400).json({
        success: false,
        message: "Nilai pengaturan tidak dapat diserialisasi sebagai JSON."
      });
    }

    const actorId = req.user && req.user.id;
    if (!actorId) {
      return res.status(401).json({
        success: false,
        message: "Identitas pengguna tidak tersedia."
      });
    }

    let conn;
    try {
      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [rows] = await conn.execute(
        `SELECT setting_key, setting_value, description, is_public
         FROM platform_settings
         WHERE setting_key = ?
         FOR UPDATE`,
        [key]
      );

      if (!rows.length) {
        await conn.rollback();
        return res.status(404).json({
          success: false,
          message: "Kunci pengaturan belum terdaftar. Tidak ada data baru yang dibuat.",
          key
        });
      }

      const current = rows[0];
      const beforeValue = parseJson(current.setting_value);

      await conn.execute(
        `UPDATE platform_settings
         SET setting_value = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
         WHERE setting_key = ?`,
        [encodedValue, actorId, key]
      );

      await conn.execute(
        `INSERT INTO audit_logs
          (actor_user_id, action, entity_type, entity_id,
           before_data, after_data, ip_address, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          actorId,
          "settings.update",
          "platform_setting",
          key,
          JSON.stringify({ value: beforeValue }),
          JSON.stringify({ value: req.body.value }),
          req.ip || null,
          String(req.get("user-agent") || "").slice(0, 500) || null
        ]
      );

      await conn.commit();

      return res.json({
        success: true,
        message: "Pengaturan berhasil diperbarui.",
        setting: {
          key,
          value: req.body.value,
          description: current.description,
          isPublic: Boolean(current.is_public)
        }
      });
    } catch (error) {
      if (conn) {
        try { await conn.rollback(); } catch (_) {}
      }
      return next(error);
    } finally {
      if (conn) conn.release();
    }
  }
);

module.exports = router;