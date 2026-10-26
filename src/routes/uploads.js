const express = require("express");
const multer = require("multer");
const path = require("path");
const db = require("../db");
const requireAuth = require("../middleware/require-auth");
const { uploadToCloudinary, deleteFromCloudinary } = require("../cloudinary");

const router = express.Router();

// Multer memory storage untuk Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
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

// ============================================================
// POST /api/v1/uploads — Upload gambar produk (Cloudinary)
// ============================================================
router.post("/uploads", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "File gambar wajib diunggah.",
      });
    }

    // Upload ke Cloudinary
    const result = await uploadToCloudinary(
      req.file.buffer,
      `nusadhipa/products/${req.user?.id || "general"}`
    );

    // Kalau ada product_id, insert ke product_images
    const { product_id, is_primary } = req.body || {};
    let imageRecord = null;

    if (product_id) {
      // Cek produk ada
      const [products] = await db.execute(
        "SELECT id FROM products WHERE public_id = ? OR id = ? LIMIT 1",
        [product_id, product_id]
      );

      if (products.length > 0) {
        const productId = products[0].id;
        const [countRows] = await db.execute(
          "SELECT COUNT(*) AS total FROM product_images WHERE product_id = ?",
          [productId]
        );
        const isPrimary = countRows[0].total === 0 ? 1 : (is_primary ? 1 : 0);

        const [insertResult] = await db.execute(
          `INSERT INTO product_images 
            (product_id, image_url, is_primary, sort_order, created_at)
           VALUES (?, ?, ?, 0, NOW())`,
          [productId, result.url, isPrimary]
        );

        imageRecord = {
          id: insertResult.insertId,
          product_id: productId,
          image_url: result.url,
          is_primary: isPrimary,
          sort_order: 0,
        };
      }
    }

    res.status(201).json({
      success: true,
      message: "Gambar berhasil diunggah.",
      data: imageRecord || {
        image_url: result.url,
        width: result.width,
        height: result.height,
        format: result.format,
        public_id: result.publicId,
      },
    });
  } catch (err) {
    console.error("Upload error:", err);
    next(err);
  }
});

// ============================================================
// DELETE /api/v1/uploads/:publicId — Hapus gambar dari Cloudinary
// ============================================================
router.delete("/uploads/:publicId", requireAuth, async (req, res, next) => {
  try {
    const { publicId } = req.params;
    await deleteFromCloudinary(publicId);
    res.json({ success: true, message: "Gambar dihapus." });
  } catch (err) {
    next(err);
  }
});

module.exports = router;