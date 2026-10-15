const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();
const secretPath = path.resolve(__dirname, "../../.jwt-secret.local");
const allowedTypes = new Set([
  "warehouse", "outlet", "office", "distribution", "other"
]);

async function authenticate(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      error: "Token Bearer diperlukan."
    });
  }

  let claims;
  try {
    if (!fs.existsSync(secretPath)) throw new Error("Secret tidak tersedia");

    const secret = fs.readFileSync(secretPath, "utf8").trim();
    if (secret.length < 32) throw new Error("Secret tidak valid");

    claims = jwt.verify(match[1], secret, {
      issuer: "nusadhipa-marketplace"
    });

    if (!/^\d+$/.test(String(claims.userId || ""))) {
      throw new Error("Klaim pengguna tidak valid");
    }
  } catch (_error) {
    return res.status(401).json({
      success: false,
      error: "Token tidak valid atau sudah kedaluwarsa."
    });
  }

  const [users] = await db.execute(
    "SELECT id FROM users WHERE id = ? AND status = 'active' LIMIT 1",
    [claims.userId]
  );

  if (!users.length) {
    return res.status(401).json({
      success: false,
      error: "Akun tidak aktif atau tidak ditemukan."
    });
  }

  req.authUserId = String(users[0].id);
  return next();
}

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

async function getOwnedBusiness(businessId, userId) {
  if (!/^\d+$/.test(String(businessId))) return null;

  const [rows] = await db.execute(
    `SELECT id, business_name
     FROM businesses
     WHERE id = ? AND owner_user_id = ?
     LIMIT 1`,
    [businessId, userId]
  );

  return rows[0] || null;
}

// GET /api/v1/businesses/:businessId/locations
router.get(
  "/businesses/:businessId/locations",
  authenticate,
  asyncRoute(async (req, res) => {
    const business = await getOwnedBusiness(
      req.params.businessId, req.authUserId
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "Bisnis tidak ditemukan atau akses ditolak."
      });
    }

    const [rows] = await db.execute(
      `SELECT public_id, location_type, name, province, city,
              district, subdistrict, address, postal_code, phone,
              is_primary, status, created_at, updated_at
       FROM business_locations
       WHERE business_id = ?
       ORDER BY is_primary DESC, id ASC`,
      [business.id]
    );

    return res.json({
      success: true,
      data: rows
    });
  })
);

// POST /api/v1/businesses/:businessId/locations
router.post(
  "/businesses/:businessId/locations",
  authenticate,
  asyncRoute(async (req, res) => {
    const business = await getOwnedBusiness(
      req.params.businessId, req.authUserId
    );

    if (!business) {
      return res.status(404).json({
        success: false,
        error: "Bisnis tidak ditemukan atau akses ditolak."
      });
    }

    const body = req.body || {};
    const type = String(body.location_type || "");
    const name = String(body.name || "").trim();
    const province = String(body.province || "").trim();
    const city = String(body.city || "").trim();
    const address = String(body.address || "").trim();

    if (
      !allowedTypes.has(type) ||
      !name || name.length > 150 ||
      !province || province.length > 100 ||
      !city || city.length > 100 ||
      !address
    ) {
      return res.status(400).json({
        success: false,
        error: "Jenis, nama, provinsi, kota/kabupaten, dan alamat wajib valid."
      });
    }

    const optionalText = (value, max) => {
      if (value == null || value === "") return null;
      if (typeof value !== "string" || value.trim().length > max) {
        return undefined;
      }
      return value.trim();
    };

    const district = optionalText(body.district, 100);
    const subdistrict = optionalText(body.subdistrict, 100);
    const postalCode = optionalText(body.postal_code, 10);
    const phone = optionalText(body.phone, 30);

    if ([district, subdistrict, postalCode, phone].includes(undefined)) {
      return res.status(400).json({
        success: false,
        error: "Format atau panjang data lokasi opsional tidak valid."
      });
    }

    const primary = body.is_primary === true;
    const conn = await db.getConnection();

    try {
      await conn.beginTransaction();

      if (primary) {
        await conn.execute(
          "UPDATE business_locations SET is_primary = 0 WHERE business_id = ?",
          [business.id]
        );
      }

      const [result] = await conn.execute(
        `INSERT INTO business_locations
          (public_id, business_id, location_type, name, province, city,
           district, subdistrict, address, postal_code, phone, is_primary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          crypto.randomUUID(), business.id, type, name, province, city,
          district, subdistrict, address, postalCode, phone, primary ? 1 : 0
        ]
      );

      await conn.commit();

      return res.status(201).json({
        success: true,
        message: "Lokasi berhasil ditambahkan.",
        data: { id: result.insertId, name, location_type: type }
      });
    } catch (error) {
      await conn.rollback();

      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          error: "Nama lokasi tersebut sudah terdaftar untuk bisnis ini."
        });
      }

      throw error;
    } finally {
      conn.release();
    }
  })
);

module.exports = router;

