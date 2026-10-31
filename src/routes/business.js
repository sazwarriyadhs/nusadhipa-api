const requireAuth = require('../middleware/require-auth');
const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db");
const { uploadToCloudinary, deleteFromCloudinary } = require('../cloudinary');

const router = express.Router();
const secretPath = path.resolve(__dirname, "../../.jwt-secret.local");

// Multer memory storage untuk Cloudinary
const businessUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format tidak didukung. Gunakan JPG/PNG/WebP/PDF."));
    }
  },
});

function readSecret() {
  try {
    return fs.readFileSync(secretPath, "utf8").trim();
  } catch {
    return process.env.JWT_SECRET || "nusadhipa-dev-secret";
  }
}

// GET /businesses/me
router.get("/businesses/me", async (req, res, next) => {
  try {
    let businessId = 1;

    const header = req.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    if (match) {
      try {
        const payload = jwt.verify(match[1], readSecret());
        if (payload?.businessId) {
          businessId = payload.businessId;
        } else if (payload?.userId) {
          const [bizRows] = await db.execute(
            "SELECT id FROM businesses WHERE owner_user_id = ?",
            [payload.userId]
          );
          if (bizRows.length > 0) businessId = bizRows[0].id;
        }
      } catch {
        // Ignore token error
      }
    }

    const [bizRows] = await db.execute(
      `SELECT 
        id, public_id, business_name, legal_name, slug, business_type,
        description, logo_url, banner_url, email, phone,
        province, city, address, nib, tax_number,
        halal_certificate_url,
        halal_certificate_number,
        halal_owner_name,
        kbli_code, kbli_name, verification_status, status
       FROM businesses
       WHERE id = ? LIMIT 1`,
      [businessId]
    );

    if (bizRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Business tidak ditemukan.",
      });
    }

    const [kbliRows] = await db.execute(
      `SELECT kbli_code AS code, kbli_name AS name, is_primary
       FROM business_kbli
       WHERE business_id = ?
       ORDER BY is_primary DESC, id ASC`,
      [businessId]
    );

    const biz = bizRows[0];
    const data = {
      public_id: biz.public_id,
      business_name: biz.business_name,
      legal_name: biz.legal_name,
      slug: biz.slug,
      business_type: biz.business_type,
      description: biz.description,
      logo_url: biz.logo_url,
      banner_url: biz.banner_url,
      email: biz.email,
      phone: biz.phone,
      province: biz.province,
      city: biz.city,
      address: biz.address,
      nib: biz.nib,
      tax_number: biz.tax_number,
      halal_certificate_url: biz.halal_certificate_url,
      halal_certificate_number: biz.halal_certificate_number,
      halal_owner_name: biz.halal_owner_name,
      kbli_code: biz.kbli_code,
      kbli_name: biz.kbli_name,
      verification_status: biz.verification_status,
      status: biz.status,
      kbli_list: kbliRows.map((k) => ({
        code: k.code,
        name: k.name,
        is_primary: k.is_primary === 1,
      })),
    };

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

// ============================================================
// POST /businesses/me/logo — Upload logo tenant (Cloudinary)
// ============================================================
router.post(
  "/businesses/me/logo",
  requireAuth,
  businessUpload.single("logo"),
  async (req, res, next) => {
    try {
      const [bizRows] = await db.execute(
        "SELECT id, logo_url FROM businesses WHERE owner_user_id = ? LIMIT 1",
        [req.user.id]
      );
      if (!bizRows.length) {
        return res.status(404).json({ success: false, message: "Business tidak ditemukan" });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "File logo wajib diunggah.",
        });
      }

      const oldUrl = bizRows[0].logo_url;
      if (oldUrl && oldUrl.includes('res.cloudinary.com')) {
        const match = oldUrl.match(/\/v\d+\/(.+)\./);
        if (match) await deleteFromCloudinary(match[1]);
      }

      const result = await uploadToCloudinary(
        req.file.buffer,
        `nusadhipa/logos/${bizRows[0].id}`
      );

      const businessId = bizRows[0].id;
      await db.execute(
        "UPDATE businesses SET logo_url = ?, updated_at = NOW() WHERE id = ?",
        [result.url, businessId]
      );

      res.json({
        success: true,
        message: "Logo berhasil diunggah.",
        data: { logo_url: result.url },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// POST /businesses/me/banner — Upload banner tenant (Cloudinary)
// ============================================================
router.post(
  "/businesses/me/banner",
  requireAuth,
  businessUpload.single("banner"),
  async (req, res, next) => {
    try {
      const [bizRows] = await db.execute(
        "SELECT id, banner_url FROM businesses WHERE owner_user_id = ? LIMIT 1",
        [req.user.id]
      );
      if (!bizRows.length) {
        return res.status(404).json({ success: false, message: "Business tidak ditemukan" });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "File banner wajib diunggah.",
        });
      }

      const oldUrl = bizRows[0].banner_url;
      if (oldUrl && oldUrl.includes('res.cloudinary.com')) {
        const match = oldUrl.match(/\/v\d+\/(.+)\./);
        if (match) await deleteFromCloudinary(match[1]);
      }

      const result = await uploadToCloudinary(
        req.file.buffer,
        `nusadhipa/banners/${bizRows[0].id}`
      );

      const businessId = bizRows[0].id;
      await db.execute(
        "UPDATE businesses SET banner_url = ?, updated_at = NOW() WHERE id = ?",
        [result.url, businessId]
      );

      res.json({
        success: true,
        message: "Banner berhasil diunggah.",
        data: { banner_url: result.url },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// POST /businesses/me/halal-certificate — Upload Sertifikat Halal
// ============================================================
router.post(
  "/businesses/me/halal-certificate",
  requireAuth,
  businessUpload.single("document"),
  async (req, res, next) => {
    try {
      const [bizRows] = await db.execute(
        "SELECT id, halal_certificate_url FROM businesses WHERE owner_user_id = ? LIMIT 1",
        [req.user.id]
      );
      if (!bizRows.length) {
        return res.status(404).json({ success: false, message: "Business tidak ditemukan" });
      }
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "File sertifikat halal wajib diunggah.",
        });
      }

      const oldUrl = bizRows[0].halal_certificate_url;
      if (oldUrl && oldUrl.includes('res.cloudinary.com')) {
        const match = oldUrl.match(/\/v\d+\/(.+)\./);
        if (match) await deleteFromCloudinary(match[1]);
      }

      const result = await uploadToCloudinary(
        req.file.buffer,
        `nusadhipa/halal-certificates/${bizRows[0].id}`
      );

      const businessId = bizRows[0].id;
      await db.execute(
        "UPDATE businesses SET halal_certificate_url = ?, updated_at = NOW() WHERE id = ?",
        [result.url, businessId]
      );

      res.json({
        success: true,
        message: "Sertifikat Halal berhasil diunggah.",
        data: { halal_certificate_url: result.url },
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;