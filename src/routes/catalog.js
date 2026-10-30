const express = require("express");
const multer = require("multer");
const db = require("../db");
const requireAuth = require("../middleware/require-auth");
const { uploadToCloudinary } = require("../cloudinary");

const router = express.Router();

// Multer memory storage untuk Cloudinary
const productImageUpload = multer({
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

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function positiveInt(value, fallback, max) {
  const number = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(number) || number < 1) return fallback;
  return Math.min(number, max);
}

// ============================================================
// GET /api/v1/categories
// ============================================================
router.get("/categories", asyncRoute(async (req, res) => {
  const [rows] = await db.execute(`
    SELECT id, parent_id, name, slug, description, image_url, sort_order
    FROM categories
    WHERE status = 'active'
    ORDER BY sort_order ASC, name ASC
  `);

  res.json({ success: true, data: rows });
}));

// ============================================================
// GET /api/v1/products
// ============================================================
router.get("/products", asyncRoute(async (req, res) => {
  const page = positiveInt(req.query.page, 1, 1000000);
  const limit = positiveInt(req.query.limit, 100, 1000);
  const offset = (page - 1) * limit;

  const conditions = [
    "p.status = 'active'",
    "b.status = 'active'",
    "c.status = 'active'",
    `EXISTS (
      SELECT 1 FROM product_variants pv_check
      WHERE pv_check.product_id = p.id
        AND pv_check.is_active = 1
    )`
  ];
  const params = [];

  if (typeof req.query.category === "string" && req.query.category.trim()) {
    conditions.push("c.slug = ?");
    params.push(req.query.category.trim());
  }

  if (typeof req.query.business === "string" && req.query.business.trim()) {
    conditions.push("b.slug = ?");
    params.push(req.query.business.trim());
  }

  if (req.query.business_id) {
    const bid = Number.parseInt(req.query.business_id, 10);
    if (Number.isSafeInteger(bid) && bid > 0) {
      conditions.push("b.id = ?");
      params.push(bid);
    }
  }

  if (typeof req.query.q === "string" && req.query.q.trim()) {
    const term = `%${req.query.q.trim().slice(0, 100)}%`;
    conditions.push("(p.name LIKE ? OR p.short_description LIKE ? OR p.brand LIKE ?)");
    params.push(term, term, term);
  }

  const where = conditions.join(" AND ");

  const [countRows] = await db.execute(`
    SELECT COUNT(*) AS total
    FROM products p
    JOIN businesses b ON b.id = p.business_id
    JOIN categories c ON c.id = p.category_id
    WHERE ${where}
  `, params);

  const [rows] = await db.execute(`
    SELECT
      p.public_id,
      p.name,
      p.slug,
      p.short_description,
      p.brand,
      p.product_type,
      p.condition_type,
      p.weight_grams,
      p.requires_shipping,
      c.name AS category_name,
      c.slug AS category_slug,
      b.business_name,
      b.slug AS business_slug,
      variants.min_price,
      variants.max_price,
      variants.available_stock,
      variants.min_retail_price,
      variants.max_retail_price,
      variants.min_b2b_price,
      variants.max_b2b_price,
      variants.min_b2b_kg,
      variants.selling_unit,
      variants.sales_mode,
      (
        SELECT pi.image_url
        FROM product_images pi
        WHERE pi.product_id = p.id
        ORDER BY pi.is_primary DESC, pi.sort_order ASC, pi.id ASC
        LIMIT 1
      ) AS image_url
    FROM products p
    JOIN businesses b ON b.id = p.business_id
    JOIN categories c ON c.id = p.category_id
    JOIN (
      SELECT
        pv.product_id,
        MIN(pv.price) AS min_price,
        MAX(pv.price) AS max_price,
        MIN(pv.retail_price) AS min_retail_price,
        MAX(pv.retail_price) AS max_retail_price,
        MIN(pv.b2b_price) AS min_b2b_price,
        MAX(pv.b2b_price) AS max_b2b_price,
        MIN(pv.min_b2b_kg) AS min_b2b_kg,
        MAX(pv.selling_unit) AS selling_unit,
        MAX(pv.sales_mode) AS sales_mode,
        SUM(
          GREATEST(
            COALESCE(i.quantity_on_hand, 0) -
            COALESCE(i.quantity_reserved, 0),
            0
          )
        ) AS available_stock
      FROM product_variants pv
      LEFT JOIN inventory i ON i.variant_id = pv.id
      WHERE pv.is_active = 1
      GROUP BY pv.product_id
    ) variants ON variants.product_id = p.id
    WHERE ${where}
    ORDER BY p.published_at DESC, p.id DESC
    LIMIT ? OFFSET ?
  `, [...params, limit, offset]);

  const total = Number(countRows[0].total);

  res.json({
    success: true,
    data: rows,
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    }
  });
}));

// ============================================================
// GET /api/v1/products/:slug
// ============================================================
router.get("/products/:slug", asyncRoute(async (req, res) => {
  const [products] = await db.execute(`
    SELECT
      p.id,
      p.public_id,
      p.name,
      p.slug,
      p.sku,
      p.short_description,
      p.description,
      p.brand,
      p.product_type,
      p.condition_type,
      p.weight_grams,
      p.requires_shipping,
      p.published_at,
      c.name AS category_name,
      c.slug AS category_slug,
      b.business_name,
      b.slug AS business_slug,
      b.logo_url AS business_logo_url
    FROM products p
    JOIN businesses b ON b.id = p.business_id
    JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ?
      AND p.status = 'active'
      AND b.status = 'active'
      AND c.status = 'active'
    LIMIT 1
  `, [req.params.slug]);

  if (!products.length) {
    return res.status(404).json({
      success: false,
      error: { code: "PRODUCT_NOT_FOUND", message: "Produk tidak ditemukan." }
    });
  }

  const product = products[0];

  const [variants] = await db.execute(`
    SELECT
      pv.id,
      pv.variant_name,
      pv.sku,
      pv.attributes,
      pv.price,
      pv.compare_at_price,
      pv.retail_price,
      pv.b2b_price,
      pv.min_retail_kg,
      pv.min_b2b_kg,
      pv.retail_step_kg,
      pv.b2b_step_kg,
      pv.selling_unit,
      pv.sales_mode,
      pv.weight_grams,
      GREATEST(
        COALESCE(i.quantity_on_hand, 0) -
        COALESCE(i.quantity_reserved, 0),
        0
      ) AS available_stock
    FROM product_variants pv
    LEFT JOIN inventory i ON i.variant_id = pv.id
    WHERE pv.product_id = ? AND pv.is_active = 1
    ORDER BY pv.id ASC
  `, [product.id]);

  const [images] = await db.execute(`
    SELECT image_url, alt_text, sort_order, is_primary
    FROM product_images
    WHERE product_id = ?
    ORDER BY is_primary DESC, sort_order ASC, id ASC
  `, [product.id]);

  delete product.id;

  res.json({
    success: true,
    data: { ...product, variants, images }
  });
}));

// ============================================================
// POST /api/v1/products — Tambah produk baru
// ============================================================
router.post("/products", asyncRoute(async (req, res) => {
  const businessId = 1;

  const { name, price, stock, description, category_slug, sku } = req.body || {};

  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ success: false, message: "Nama produk wajib diisi." });
  }

  const priceNum = Number(price);
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return res.status(400).json({ success: false, message: "Harga produk tidak valid." });
  }

  const stockNum = Number(stock);
  if (!Number.isFinite(stockNum) || stockNum < 0) {
    return res.status(400).json({ success: false, message: "Stok produk tidak valid." });
  }

  const slugBase = name.toLowerCase().trim()
    .replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
  const slug = `sauri-${slugBase}-${Date.now()}`;

  let categoryId = null;
  if (category_slug) {
    const [cats] = await db.execute("SELECT id FROM categories WHERE slug = ? LIMIT 1", [category_slug]);
    if (cats.length > 0) categoryId = cats[0].id;
  }
  if (!categoryId) {
    const [defaultCat] = await db.execute("SELECT id FROM categories WHERE slug = 'daging-unggas' LIMIT 1");
    categoryId = defaultCat.length > 0 ? defaultCat[0].id : 1;
  }

  const crypto = require("crypto");
  const publicId = crypto.randomUUID();

  try {
    const [productResult] = await db.execute(
      `INSERT INTO products (
        public_id, business_id, category_id, name, slug, sku,
        short_description, product_type, condition_type, status,
        weight_grams, requires_shipping, published_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'physical', 'new', 'active', 1000, 1, NOW())`,
      [publicId, businessId, categoryId, name.trim(), slug, sku || null, description || null]
    );

    const productId = productResult.insertId;
    const variantSku = sku || `SAURI-${productId}-DEFAULT`;
    const [variantResult] = await db.execute(
      `INSERT INTO product_variants (
        product_id, variant_name, sku, price, weight_grams,
        is_active, selling_unit, quantity_step
      ) VALUES (?, 'Default', ?, ?, 1000, 1, 'unit', 1.000)`,
      [productId, variantSku, priceNum]
    );

    try {
      await db.execute(
        `INSERT INTO inventory (variant_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, 0)`,
        [variantResult.insertId, stockNum]
      );
    } catch (invErr) {}

    res.status(201).json({
      success: true,
      message: "Produk berhasil dibuat.",
      data: {
        public_id: publicId,
        id: productId,
        name: name.trim(),
        slug,
        price: priceNum,
        stock: stockNum,
      },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ success: false, message: "Produk dengan SKU tersebut sudah ada." });
    }
    throw err;
  }
}));

// ============================================================
// POST /products/:publicId/images — Upload gambar produk (Cloudinary)
// ============================================================
router.post(
  "/products/:publicId/images",
  requireAuth,
  productImageUpload.single("image"),
  asyncRoute(async (req, res) => {
    const { publicId } = req.params;

    const [products] = await db.execute(
      "SELECT id FROM products WHERE public_id = ? LIMIT 1",
      [publicId]
    );

    if (products.length === 0) {
      return res.status(404).json({ success: false, message: "Produk tidak ditemukan." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "File gambar wajib diunggah." });
    }

    const productId = products[0].id;

    const result = await uploadToCloudinary(
      req.file.buffer,
      `nusadhipa/products/${productId}`
    );

    const [existing] = await db.execute(
      "SELECT COUNT(*) AS total FROM product_images WHERE product_id = ?",
      [productId]
    );
    const isPrimary = existing[0].total === 0 ? 1 : 0;

    const [insertResult] = await db.execute(
      `INSERT INTO product_images 
        (product_id, image_url, is_primary, sort_order, created_at)
       VALUES (?, ?, ?, 0, NOW())`,
      [productId, result.url, isPrimary]
    );

    res.status(201).json({
      success: true,
      message: "Gambar berhasil diunggah.",
      data: {
        id: insertResult.insertId,
        product_id: productId,
        image_url: result.url,
        is_primary: isPrimary,
        sort_order: 0,
      },
    });
  })
);

// ============================================================
// PUT /api/v1/products/:publicId — Update produk
// ============================================================
router.put("/products/:publicId", asyncRoute(async (req, res) => {
  const publicId = req.params.publicId;
  const { name, price, stock, description, category_slug } = req.body || {};

  const [products] = await db.execute(
    "SELECT id FROM products WHERE public_id = ? LIMIT 1",
    [publicId]
  );
  if (products.length === 0) {
    return res.status(404).json({ success: false, message: "Produk tidak ditemukan." });
  }
  const productId = products[0].id;

  if (name !== undefined) {
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Nama produk tidak valid." });
    }
  }
  if (price !== undefined) {
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      return res.status(400).json({ success: false, message: "Harga tidak valid." });
    }
  }
  if (stock !== undefined) {
    const stockNum = Number(stock);
    if (!Number.isFinite(stockNum) || stockNum < 0) {
      return res.status(400).json({ success: false, message: "Stok tidak valid." });
    }
  }

  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push("name = ?");
    params.push(name.trim());
  }
  if (description !== undefined) {
    updates.push("short_description = ?");
    params.push(description || null);
  }
  if (category_slug) {
    const [cats] = await db.execute(
      "SELECT id FROM categories WHERE slug = ? LIMIT 1",
      [category_slug]
    );
    if (cats.length > 0) {
      updates.push("category_id = ?");
      params.push(cats[0].id);
    }
  }

  if (updates.length > 0) {
    params.push(productId);
    await db.execute(
      `UPDATE products SET ${updates.join(", ")}, updated_at = NOW() WHERE id = ?`,
      params
    );
  }

  if (price !== undefined) {
    const priceNum = Number(price);
    await db.execute(
      `UPDATE product_variants SET price = ?, updated_at = NOW()
       WHERE product_id = ? AND is_active = 1`,
      [priceNum, productId]
    );
  }

  if (stock !== undefined) {
    const stockNum = Number(stock);
    const [variants] = await db.execute(
      "SELECT id FROM product_variants WHERE product_id = ? AND is_active = 1",
      [productId]
    );
    for (const v of variants) {
      const [inv] = await db.execute(
        "SELECT id FROM inventory WHERE variant_id = ? LIMIT 1",
        [v.id]
      );
      if (inv.length > 0) {
        await db.execute(
          "UPDATE inventory SET quantity_on_hand = ?, updated_at = NOW() WHERE variant_id = ?",
          [stockNum, v.id]
        );
      } else {
        await db.execute(
          "INSERT INTO inventory (variant_id, quantity_on_hand, quantity_reserved) VALUES (?, ?, 0)",
          [v.id, stockNum]
        );
      }
    }
  }

  res.json({
    success: true,
    message: "Produk berhasil diupdate.",
    data: { public_id: publicId, id: productId },
  });
}));

// ============================================================
// DELETE /api/v1/products/:publicId — Hapus produk
// ============================================================
router.delete("/products/:publicId", asyncRoute(async (req, res) => {
  const publicId = req.params.publicId;

  const [products] = await db.execute(
    "SELECT id FROM products WHERE public_id = ? LIMIT 1",
    [publicId]
  );
  if (products.length === 0) {
    return res.status(404).json({ success: false, message: "Produk tidak ditemukan." });
  }
  const productId = products[0].id;

  await db.execute(
    "UPDATE products SET status = 'archived', updated_at = NOW() WHERE id = ?",
    [productId]
  );

  res.json({ success: true, message: "Produk berhasil dihapus." });
}));

// ============================================================
// GET /api/v1/businesses/me — Ambil bisnis milik user yang login
// ============================================================
router.get("/businesses/me", requireAuth, asyncRoute(async (req, res) => {
  const userId = req.user?.id || req.user?.userId;
  
  if (!userId) {
    return res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Token tidak valid." }
    });
  }

  const [rows] = await db.execute(`
    SELECT 
      b.id, b.public_id, b.business_name, b.legal_name, b.slug,
      b.business_type, b.description, b.logo_url, b.banner_url, b.instagram_url, b.tiktok_url, b.facebook_url, b.website_url,
      b.halal_certificate_number, b.halal_owner_name,
      b.email, b.phone, b.province, b.city, b.address, b.nib, b.kbli_code, b.kbli_name, b.verification_status, b.status, (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id AND p.status = 'active') AS product_count FROM businesses b WHERE b.owner_user_id = ? AND b.status = 'active'
    LIMIT 1
  `, [userId]);

  if (!rows.length) {
    return res.status(404).json({
      success: false,
      error: { code: "BUSINESS_NOT_FOUND", message: "Bisnis tidak ditemukan untuk user ini." }
    });
  }

  const business = rows[0];

  const [kbli] = await db.execute(`
    SELECT kbli_code AS code, kbli_name AS name, is_primary
    FROM business_kbli
    WHERE business_id = ?
    ORDER BY is_primary DESC
  `, [business.id]);

  delete business.id;

  res.json({
    success: true,
    data: { ...business, kbli_list: kbli }
  });
}));

// ============================================================
// GET /api/v1/businesses/:slug — Public business detail
// ============================================================
router.get("/businesses/:slug", asyncRoute(async (req, res) => {
  const slug = String(req.params.slug || "").trim();
  if (!slug) {
    return res.status(400).json({
      success: false,
      error: { code: "INVALID_SLUG", message: "Slug tidak valid." }
    });
  }

  const [rows] = await db.execute(`
    SELECT 
      b.id, b.public_id, b.business_name, b.legal_name, b.slug,
      b.business_type, b.description, b.logo_url, b.banner_url, b.instagram_url, b.tiktok_url, b.facebook_url, b.website_url,
      b.halal_certificate_number, b.halal_owner_name,
      b.email, b.phone, b.province, b.city, b.address, b.nib, b.kbli_code, b.kbli_name, b.verification_status, b.status, (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id AND p.status = 'active') AS product_count FROM businesses b WHERE b.slug = ? AND b.status = 'active'
    LIMIT 1
  `, [slug]);

  if (!rows.length) {
    return res.status(404).json({
      success: false,
      error: { code: "BUSINESS_NOT_FOUND", message: "Toko tidak ditemukan." }
    });
  }

  const business = rows[0];

  const [kbli] = await db.execute(`
    SELECT kbli_code AS code, kbli_name AS name, is_primary
    FROM business_kbli
    WHERE business_id = ?
    ORDER BY is_primary DESC
  `, [business.id]);

  delete business.id;

  res.json({
    success: true,
    data: { ...business, kbli_list: kbli }
  });
}));

// ============================================================
// GET /api/v1/businesses — Public list semua business aktif
// ============================================================
router.get("/businesses", asyncRoute(async (req, res) => {
  const [rows] = await db.execute(`
    SELECT 
      b.public_id, b.business_name, b.legal_name, b.slug,
      b.business_type, b.description, b.logo_url, b.banner_url, b.instagram_url, b.tiktok_url, b.facebook_url, b.website_url,
      b.halal_certificate_number, b.halal_owner_name,
      b.email, b.phone, b.province, b.city, b.address, b.nib, b.kbli_code, b.kbli_name, b.verification_status, b.status, (SELECT COUNT(*) FROM products p WHERE p.business_id = b.id AND p.status = 'active') AS product_count FROM businesses b WHERE b.status = 'active'
    ORDER BY b.business_name ASC
  `);

  res.json({ success: true, data: rows });
}));

module.exports = router;



