const express = require("express");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db");

const router = express.Router();
const secretPath = path.resolve(__dirname, "../../.jwt-secret.local");

// ===== Setup upload folder untuk logo & banner =====
const BUSINESS_UPLOAD_DIR = path.resolve(__dirname, "../../public/uploads/business-logos");
if (!fs.existsSync(BUSINESS_UPLOAD_DIR)) {
  fs.mkdirSync(BUSINESS_UPLOAD_DIR, { recursive: true });
}

const businessUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, BUSINESS_UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `business-${Date.now()}-${crypto.randomBytes(4).toString("hex")}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format tidak didukung. Gunakan JPG/PNG/WebP."));
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

async function authenticate(req, res, next) {
  const header = req.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      message: "Token otentikasi diperlukan.",
    });
  }

  try {
    const payload = jwt.verify(match[1], readSecret());
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({
      success: false,
      message: "Token tidak valid atau kedaluwarsa.",
    });
  }
}

// GET /api/v1/businesses/me
// Untuk testing: kalau tidak ada token, fallback ke business id=1
router.get("/businesses/me", async (req, res, next) => {
  try {
    let businessId = 1;

    // Kalau ada Authorization header, coba verify
    const header = req.get("authorization") || "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    if (match) {
      try {
        const payload = jwt.verify(match[1], readSecret());
        if (payload?.businessId) {
          businessId = payload.businessId;
        } else if (payload?.userId) {
          const [bizRows] = await db.execute(
            "SELECT id FROM businesses WHERE owner_user_id = ? LIMIT 1",
            [payload.userId]
          );
          if (bizRows.length > 0) businessId = bizRows[0].id;
        }
      } catch {
        // Ignore token error — fallback ke id=1 (dev mode)
      }
    }

    const [bizRows] = await db.execute(
      `SELECT 
        id, public_id, business_name, legal_name, slug, business_type,
        description, logo_url, banner_url, email, phone,
        province, city, address, nib, tax_number,
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

    res.json({
      success: true,
      data: {
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
        kbli_code: biz.kbli_code,
        kbli_name: biz.kbli_name,
        verification_status: biz.verification_status,
        status: biz.status,
        kbli_list: kbliRows,
      },
    });
  } catch (err) {
    next(err);
  }
});


// ============================================================
// POST /businesses/me/logo — Upload logo tenant
// ============================================================
router.post(
  "/businesses/me/logo",
  businessUpload.single("logo"),
  async (req, res, next) => {
    try {
      const businessId = 1;
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "File logo wajib diunggah.",
        });
      }

      const logoUrl = `/uploads/business-logos/${req.file.filename}`;
      await db.execute(
        "UPDATE businesses SET logo_url = ?, updated_at = NOW() WHERE id = ?",
        [logoUrl, businessId]
      );

      res.json({
        success: true,
        message: "Logo berhasil diunggah.",
        data: { logo_url: logoUrl },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// POST /businesses/me/banner — Upload banner tenant
// ============================================================
router.post(
  "/businesses/me/banner",
  businessUpload.single("banner"),
  async (req, res, next) => {
    try {
      const businessId = 1;
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "File banner wajib diunggah.",
        });
      }

      const bannerUrl = `/uploads/business-logos/${req.file.filename}`;
      await db.execute(
        "UPDATE businesses SET banner_url = ?, updated_at = NOW() WHERE id = ?",
        [bannerUrl, businessId]
      );

      res.json({
        success: true,
        message: "Banner berhasil diunggah.",
        data: { banner_url: bannerUrl },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ============================================================
// PUT /businesses/me — Update info bisnis
// ============================================================
router.put("/businesses/me", async (req, res, next) => {
  try {
    const businessId = 1;
    const {
      business_name,
      description,
      email,
      phone,
      address,
      city,
      province,
    } = req.body || {};

    const updates = [];
    const params = [];

    if (business_name !== undefined) {
      if (typeof business_name !== "string" || !business_name.trim()) {
        return res.status(400).json({
          success: false,
          message: "Nama bisnis tidak valid.",
        });
      }
      updates.push("business_name = ?");
      params.push(business_name.trim());
    }
    if (description !== undefined) {
      updates.push("description = ?");
      params.push(description || null);
    }
    if (email !== undefined) {
      updates.push("email = ?");
      params.push(email || null);
    }
    if (phone !== undefined) {
      updates.push("phone = ?");
      params.push(phone || null);
    }
    if (address !== undefined) {
      updates.push("address = ?");
      params.push(address || null);
    }
    if (city !== undefined) {
      updates.push("city = ?");
      params.push(city || null);
    }
    if (province !== undefined) {
      updates.push("province = ?");
      params.push(province || null);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data yang diupdate.",
      });
    }

    params.push(businessId);
    await db.execute(
      `UPDATE businesses SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ?`,
      params
    );

    res.json({
      success: true,
      message: "Info bisnis berhasil diupdate.",
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
