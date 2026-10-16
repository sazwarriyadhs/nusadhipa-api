// src/routes/cart.js
// Support retail (min 0.5 kg, step 0.5 kg) & B2B (min 50 kg, step 1 kg)
const express = require("express");
const db = require("../db");

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

// ============ Helper: ambil customer_type user ============
async function getUserCustomerType(conn, userId) {
  const [rows] = await conn.execute(
    `SELECT customer_type FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  return rows.length > 0 ? (rows[0].customer_type || "retail") : "retail";
}

// ============ Helper: tentukan policy berdasarkan customer_type & qty ============
function resolvePolicy(variant, customerType, requestedQty) {
  if (!["package", "weight"].includes(variant.sales_mode)) {
    return { mode: "unclassified", available: false, reason: "Varian belum diklasifikasikan.", minQty: 0, step: 0, price: 0, unit: variant.selling_unit || "unit" };
  }

  if (variant.sales_mode === "package") {
    if (variant.selling_unit === "kg") {
      return { mode: "invalid", available: false, reason: "Satuan varian kemasan tidak valid.", minQty: 0, step: 0, price: 0, unit: "kg" };
    }
    const price = Number(variant.retail_price ?? variant.price);
    return {
      mode: "package",
      available: Number.isFinite(price) && price > 0,
      reason: Number.isFinite(price) && price > 0 ? null : "Harga kemasan belum ditetapkan.",
      minQty: 1, step: 1, price, unit: "unit"
    };
  }

  if (variant.selling_unit !== "kg") {
    return { mode: "invalid", available: false, reason: "Satuan varian timbang tidak valid.", minQty: 0, step: 0, price: 0, unit: variant.selling_unit || "unit" };
  }

  const minRetail = Number(variant.min_retail_kg ?? 0.5);
  const minB2B = Number(variant.min_b2b_kg ?? 50);
  const stepRetail = Number(variant.retail_step_kg ?? 0.5);
  const stepB2B = Number(variant.b2b_step_kg ?? 1);
  const priceRetail = Number(variant.retail_price ?? variant.price);
  const priceB2B = variant.b2b_price == null ? null : Number(variant.b2b_price);
  const useB2B = customerType === "b2b" ||
    (customerType === "retail" && Number(requestedQty) >= minB2B);

  if (useB2B) {
    const validPrice = priceB2B !== null && Number.isFinite(priceB2B) && priceB2B > 0;
    return {
      mode: "b2b", available: validPrice,
      reason: validPrice ? null : "Harga B2B belum ditetapkan.",
      minQty: minB2B, step: stepB2B, price: validPrice ? priceB2B : 0, unit: "kg"
    };
  }

  const validPrice = Number.isFinite(priceRetail) && priceRetail > 0;
  return {
    mode: "retail", available: validPrice,
    reason: validPrice ? null : "Harga retail belum ditetapkan.",
    minQty: minRetail, step: stepRetail, price: validPrice ? priceRetail : 0, unit: "kg"
  };
}

// ============ Helper: normalisasi quantity ============
function validateQty(rawQty, policy) {
  if (!policy.available) return policy.reason || "Varian tidak tersedia untuk dibeli.";
  if (rawQty === undefined || rawQty === null || rawQty === "" || typeof rawQty === "boolean") {
    return "Quantity wajib berupa angka positif.";
  }

  const qty = Number(rawQty);
  if (!Number.isFinite(qty) || qty <= 0) return "Quantity wajib berupa angka positif.";
  if (qty < policy.minQty) return "Minimum pembelian " + policy.minQty + " " + policy.unit + ".";
  if (Math.abs(qty / policy.step - Math.round(qty / policy.step)) > 1e-8) {
    return "Quantity harus mengikuti kelipatan " + policy.step + " " + policy.unit + ".";
  }
  if (policy.unit !== "kg" && !Number.isInteger(qty)) return "Jumlah kemasan harus bilangan bulat.";
  return null;
}

// ============ Helper: cart aktif ============
async function getOrCreateActiveCart(conn, userId) {
  const [carts] = await conn.execute(
    `SELECT id FROM carts WHERE user_id = ? AND status = 'active' LIMIT 1`,
    [userId]
  );
  if (carts.length > 0) return carts[0].id;
  const [result] = await conn.execute(
    `INSERT INTO carts (user_id, status, currency) VALUES (?, 'active', 'IDR')`,
    [userId]
  );
  return result.insertId;
}

// ============================================================
// GET /api/v1/cart?user_id=9
// ============================================================
router.get(
  "/cart",
  asyncRoute(async (req, res) => {
    const userId = Number(req.query.user_id || req.body?.user_id || 9);

    const conn = await db.getConnection();
    try {
      const cartId = await getOrCreateActiveCart(conn, userId);
      const customerType = await getUserCustomerType(conn, userId);

      const [items] = await conn.execute(
        `SELECT
          ci.id, ci.quantity, ci.variant_id,
          pv.variant_name, pv.sku, pv.price,
          pv.sales_mode, pv.selling_unit, pv.quantity_step, pv.weight_grams,
          pv.retail_price, pv.b2b_price,
          pv.min_retail_kg, pv.min_b2b_kg,
          pv.retail_step_kg, pv.b2b_step_kg,
          p.id AS product_id, p.public_id AS product_public_id,
          p.name AS product_name, p.business_id,
          b.business_name,
          (SELECT image_url FROM product_images
           WHERE product_id = p.id AND is_primary = 1 LIMIT 1) AS image_url,
          COALESCE(inv.quantity_on_hand, 0) - COALESCE(inv.quantity_reserved, 0) AS available_stock
        FROM cart_items ci
        JOIN product_variants pv ON pv.id = ci.variant_id
        JOIN products p ON p.id = pv.product_id
        JOIN businesses b ON b.id = p.business_id
        LEFT JOIN inventory inv ON inv.variant_id = pv.id
        WHERE ci.cart_id = ?
        ORDER BY ci.created_at DESC`,
        [cartId]
      );

      const mapped = items.map((it) => {
        const policy = resolvePolicy(it, customerType, Number(it.quantity));
        return {
          id: it.id,
          variant_id: it.variant_id,
          product_id: it.product_id,
          product_public_id: it.product_public_id,
          product_name: it.product_name,
          variant_name: it.variant_name,
          sku: it.sku,
          business_id: it.business_id,
          business_name: it.business_name,
          image_url: it.image_url,
          price: policy.price,
          selling_unit: policy.unit,
          quantity_step: policy.step,
          min_qty: policy.minQty,
          mode: policy.mode,
          can_purchase: Boolean(policy.available),
          availability_reason: policy.reason || null,
          weight_grams: it.weight_grams != null ? Number(it.weight_grams) : null,
          quantity: Number(it.quantity),
          available_stock: Number(it.available_stock),
          line_total:
            Math.round(policy.price * Number(it.quantity) * 100) / 100,
        };
      });

      const subtotal = mapped.reduce((sum, it) => sum + it.line_total, 0);

      res.json({
        success: true,
        data: {
          cart_id: cartId,
          customer_type: customerType,
          currency: "IDR",
          items: mapped,
          items_count: mapped.length,
          subtotal: Math.round(subtotal * 100) / 100,
        },
      });
    } finally {
      conn.release();
    }
  })
);

// ============================================================
// POST /api/v1/cart/items
// Body: { variant_id, quantity, user_id? }
// ============================================================
router.post(
  "/cart/items",
  asyncRoute(async (req, res) => {
    const userId = Number(req.body?.user_id || 9);
    const { variant_id, quantity } = req.body || {};

    if (!variant_id) {
      return res.status(400).json({
        success: false,
        message: "variant_id wajib diisi.",
      });
    }

    const conn = await db.getConnection();
    try {
      const [variants] = await conn.execute(
        `SELECT id, product_id, sales_mode, selling_unit, quantity_step, price,
                retail_price, b2b_price,
                min_retail_kg, min_b2b_kg,
                retail_step_kg, b2b_step_kg
         FROM product_variants
         WHERE id = ? AND is_active = 1`,
        [variant_id]
      );
      if (variants.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Variant tidak ditemukan atau tidak aktif.",
        });
      }
      const variant = variants[0];
      const customerType = await getUserCustomerType(conn, userId);

      const policy = resolvePolicy(variant, customerType, quantity);
      const qtyError = validateQty(quantity, policy);
      if (qtyError) return res.status(400).json({ success: false, message: qtyError });
      const qty = Number(quantity);

      const cartId = await getOrCreateActiveCart(conn, userId);

      await conn.execute(
        `INSERT INTO cart_items (cart_id, variant_id, quantity)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE
           quantity = quantity + VALUES(quantity),
           updated_at = NOW()`,
        [cartId, variant_id, qty]
      );

      res.status(201).json({
        success: true,
        message: "Item ditambahkan ke cart.",
        data: {
          cart_id: cartId,
          variant_id: variant_id,
          added_quantity: qty,
          selling_unit: policy.unit,
          mode: policy.mode,
          applied_price: policy.price,
          min_qty: policy.minQty,
          step: policy.step,
        },
      });
    } finally {
      conn.release();
    }
  })
);

// ============================================================
// PATCH /api/v1/cart/items/:id
// ============================================================
router.patch(
  "/cart/items/:id",
  asyncRoute(async (req, res) => {
    const userId = Number(req.body?.user_id || 9);
    const itemId = Number(req.params.id);
    const { quantity } = req.body || {};

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT ci.id, pv.sales_mode, pv.selling_unit, pv.quantity_step, pv.price,
                pv.retail_price, pv.b2b_price,
                pv.min_retail_kg, pv.min_b2b_kg,
                pv.retail_step_kg, pv.b2b_step_kg
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         JOIN product_variants pv ON pv.id = ci.variant_id
         WHERE ci.id = ? AND c.user_id = ? AND c.status = 'active'`,
        [itemId, userId]
      );
      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Item tidak ditemukan di cart Anda.",
        });
      }

      const customerType = await getUserCustomerType(conn, userId);
      const policy = resolvePolicy(rows[0], customerType, quantity);
      const qtyError = validateQty(quantity, policy);
      if (qtyError) return res.status(400).json({ success: false, message: qtyError });
      const qty = Number(quantity);

      await conn.execute(
        `UPDATE cart_items SET quantity = ?, updated_at = NOW() WHERE id = ?`,
        [qty, itemId]
      );

      res.json({
        success: true,
        message: "Quantity diupdate.",
        data: {
          id: itemId,
          quantity: qty,
          selling_unit: policy.unit,
          mode: policy.mode,
        },
      });
    } finally {
      conn.release();
    }
  })
);

// ============================================================
// DELETE /api/v1/cart/items/:id
// ============================================================
router.delete(
  "/cart/items/:id",
  asyncRoute(async (req, res) => {
    const userId = Number(req.body?.user_id || req.query.user_id || 9);
    const itemId = Number(req.params.id);

    const [result] = await db.execute(
      `DELETE ci FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       WHERE ci.id = ? AND c.user_id = ? AND c.status = 'active'`,
      [itemId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Item tidak ditemukan.",
      });
    }

    res.json({ success: true, message: "Item dihapus dari cart." });
  })
);

// ============================================================
// DELETE /api/v1/cart
// ============================================================
router.delete(
  "/cart",
  asyncRoute(async (req, res) => {
    const userId = Number(req.body?.user_id || req.query.user_id || 9);

    await db.execute(
      `DELETE ci FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       WHERE c.user_id = ? AND c.status = 'active'`,
      [userId]
    );

    res.json({ success: true, message: "Cart dikosongkan." });
  })
);

module.exports = router;
