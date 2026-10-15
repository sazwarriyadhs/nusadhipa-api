const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const db = require("../db");

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

// Setup folder upload
const UPLOAD_DIR = path.resolve(__dirname, "../../public/uploads/products");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer config
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
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

// POST /api/v1/products/:publicId/images
router.post(
  "/products/:publicId/images",
  upload.single("image"),
  asyncRoute(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File gambar wajib diunggah.",
      });
    }

    const publicId = req.params.publicId;
    const isPrimary = req.body.is_primary === "1" || req.body.is_primary === "true";

    // Cari product
    const [products] = await db.execute(
      "SELECT id FROM products WHERE public_id = ? LIMIT 1",
      [publicId]
    );
    if (products.length === 0) {
      // Hapus file yang sudah diupload
      fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan.",
      });
    }
    const productId = products[0].id;

    // URL relatif — nanti di-serve sebagai static
    const imageUrl = `/uploads/products/${req.file.filename}`;

    // Kalau is_primary, unset primary lama
    if (isPrimary) {
      await db.execute(
        "UPDATE product_images SET is_primary = 0 WHERE product_id = ?",
        [productId]
      );
    }

    // Cek apakah sudah ada gambar lain
    const [existing] = await db.execute(
      "SELECT COUNT(*) n FROM product_images WHERE product_id = ?",
      [productId]
    );
    const sortOrder = existing[0].n;
    const finalPrimary = isPrimary || existing[0].n === 0 ? 1 : 0;

    // Insert ke DB
    const [result] = await db.execute(
      `INSERT INTO product_images (
        product_id, image_url, alt_text, sort_order, is_primary
      ) VALUES (?, ?, ?, ?, ?)`,
      [productId, imageUrl, null, sortOrder, finalPrimary]
    );

    res.status(201).json({
      success: true,
      message: "Gambar berhasil diunggah.",
      data: {
        id: result.insertId,
        product_id: productId,
        image_url: imageUrl,
        is_primary: finalPrimary,
        sort_order: sortOrder,
      },
    });
  })
);

// GET /api/v1/products/:publicId/images
router.get(
  "/products/:publicId/images",
  asyncRoute(async (req, res) => {
    const [products] = await db.execute(
      "SELECT id FROM products WHERE public_id = ? LIMIT 1",
      [req.params.publicId]
    );
    if (products.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Produk tidak ditemukan.",
      });
    }

    const [images] = await db.execute(
      `SELECT id, image_url, alt_text, sort_order, is_primary
       FROM product_images
       WHERE product_id = ?
       ORDER BY is_primary DESC, sort_order ASC, id ASC`,
      [products[0].id]
    );

    res.json({ success: true, data: images });
  })
);

module.exports = router;
