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

// ============ Helper: policy berdasarkan selling_mode eksplisit ============
function resolvePolicy(variant, requestedMode) {
  const brand = String(variant.product_brand ?? variant.brand ?? "")
    .trim().toLowerCase();

  if (!["package", "weight"].includes(variant.sales_mode)) {
    return {
      mode: "invalid", available: false,
      reason: "Varian belum diklasifikasikan.",
      minQty: 0, maxQty: 0, step: 0, price: 0,
      unit: variant.selling_unit || "unit"
    };
  }

  if (variant.sales_mode === "package") {
    if (requestedMode !== "package" || variant.selling_unit === "kg") {
      return {
        mode: "invalid", available: false,
        reason: "Mode atau satuan varian kemasan tidak valid.",
        minQty: 0, maxQty: 0, step: 0, price: 0, unit: "unit"
      };
    }

    const price = Number(variant.retail_price ?? variant.price);
    const validPrice = Number.isFinite(price) && price > 0;

    return {
      mode: "package", available: validPrice,
      reason: validPrice ? null : "Harga kemasan belum ditetapkan.",
      minQty: 1, maxQty: Number.POSITIVE_INFINITY,
      step: Number(variant.quantity_step ?? 1),
      price: validPrice ? price : 0, unit: "unit"
    };
  }

  if (variant.selling_unit !== "kg") {
    return {
      mode: "invalid", available: false,
      reason: "Satuan varian timbang tidak valid.",
      minQty: 0, maxQty: 0, step: 0, price: 0,
      unit: variant.selling_unit || "unit"
    };
  }

  if (!["retail", "b2b"].includes(requestedMode)) {
    return {
      mode: "invalid", available: false,
      reason: "Pilih mode penjualan retail atau B2B.",
      minQty: 0, maxQty: 0, step: 0, price: 0, unit: "kg"
    };
  }

  const isSauriFresh = brand === "sauri fresh";
  const configuredRetailMin = Number(variant.min_retail_kg ?? 0.5);
  const configuredB2BMin = Number(variant.min_b2b_kg ?? 50);
  const retailStep = Number(variant.retail_step_kg ?? 0.5);
  const b2bStep = Number(variant.b2b_step_kg ?? 1);

  const minQty = requestedMode === "b2b"
    ? (isSauriFresh ? Math.max(100, configuredB2BMin) : configuredB2BMin)
    : (isSauriFresh ? 1 : configuredRetailMin);

  const maxQty = requestedMode === "retail" && isSauriFresh
    ? 99
    : Number.POSITIVE_INFINITY;

  const step = requestedMode === "b2b" ? b2bStep : retailStep;
  const rawPrice = requestedMode === "b2b"
    ? variant.b2b_price
    : (variant.retail_price ?? variant.price);
  const price = rawPrice == null || rawPrice === "" ? NaN : Number(rawPrice);
  const validPrice = Number.isFinite(price) && price > 0;
  const validRules = Number.isFinite(minQty) && minQty > 0 &&
    Number.isFinite(step) && step > 0;

  return {
    mode: requestedMode,
    available: validPrice && validRules,
    reason: !validRules
      ? "Konfigurasi minimum atau kelipatan quantity tidak valid."
      : (!validPrice
        ? (requestedMode === "b2b"
          ? "Harga B2B belum ditetapkan."
          : "Harga retail belum ditetapkan.")
        : null),
    minQty, maxQty, step,
    price: validPrice ? price : 0,
    unit: "kg"
  };
}

// ============ Helper: validasi quantity ============
function validateQty(rawQty, policy) {
  if (!policy.available) {
    return policy.reason || "Varian tidak tersedia untuk dibeli.";
  }

  if (rawQty === undefined || rawQty === null ||
      rawQty === "" || typeof rawQty === "boolean") {
    return "Quantity wajib berupa angka positif.";
  }

  const qty = Number(rawQty);
  if (!Number.isFinite(qty) || qty <= 0) {
    return "Quantity wajib berupa angka positif.";
  }

  if (qty < policy.minQty) {
    return "Minimum pembelian " + policy.minQty + " " + policy.unit + ".";
  }

  if (qty > policy.maxQty) {
    return "Maksimum pembelian " + policy.maxQty + " " + policy.unit + ".";
  }

  if (Math.abs(qty / policy.step - Math.round(qty / policy.step)) > 1e-8) {
    return "Quantity harus mengikuti kelipatan " + policy.step + " " + policy.unit + ".";
  }

  if (policy.unit !== "kg" && !Number.isInteger(qty)) {
    return "Jumlah kemasan harus bilangan bulat.";
  }

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
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(400).json({ success: false, message: "user_id tidak valid." });
    }

    const conn = await db.getConnection();
    try {
      const cartId = await getOrCreateActiveCart(conn, userId);

      const [items] = await conn.execute(
        `SELECT
          ci.id, ci.quantity, ci.variant_id, ci.selling_mode,
          pv.variant_name, pv.sku, pv.price,
          pv.sales_mode, pv.selling_unit, pv.quantity_step, pv.weight_grams,
          pv.retail_price, pv.b2b_price,
          pv.min_retail_kg, pv.min_b2b_kg,
          pv.retail_step_kg, pv.b2b_step_kg,
          p.id AS product_id, p.public_id AS product_public_id,
          p.name AS product_name, p.brand AS product_brand, p.business_id,
          b.business_name,
          (SELECT pi.image_url
           FROM product_images pi
           WHERE pi.product_id = p.id AND pi.is_primary = 1
           LIMIT 1) AS image_url,
          GREATEST(
            COALESCE(inv.quantity_on_hand, 0) -
            COALESCE(inv.quantity_reserved, 0), 0
          ) AS available_stock
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
        const qty = Number(it.quantity);
        const stock = Number(it.available_stock);
        const policy = resolvePolicy(it, it.selling_mode);
        const stockValid = Number.isFinite(stock) && stock >= 0;
        const stockEnough = stockValid && qty <= stock;
        const canPurchase = Boolean(policy.available) && stockEnough;

        return {
          id: it.id,
          variant_id: it.variant_id,
          product_id: it.product_id,
          product_public_id: it.product_public_id,
          product_name: it.product_name,
          product_brand: it.product_brand,
          variant_name: it.variant_name,
          sku: it.sku,
          business_id: it.business_id,
          business_name: it.business_name,
          image_url: it.image_url,
          selling_mode: it.selling_mode,
          mode: policy.mode,
          price: policy.price,
          selling_unit: policy.unit,
          quantity_step: policy.step,
          min_qty: policy.minQty,
          can_purchase: canPurchase,
          availability_reason: !policy.available
            ? (policy.reason || "Mode penjualan tidak tersedia.")
            : (!stockEnough
              ? `Stok tidak cukup. Tersedia: ${stockValid ? stock : 0} ${policy.unit}.`
              : null),
          weight_grams: it.weight_grams != null ? Number(it.weight_grams) : null,
          quantity: qty,
          available_stock: stockValid ? stock : 0,
          line_total: Math.round(policy.price * qty * 100) / 100
        };
      });

      const subtotal = mapped.reduce((sum, it) => sum + it.line_total, 0);

      res.json({
        success: true,
        data: {
          cart_id: cartId,
          currency: "IDR",
          items: mapped,
          items_count: mapped.length,
          subtotal: Math.round(subtotal * 100) / 100,
          can_checkout: mapped.length > 0 && mapped.every((it) => it.can_purchase)
        }
      });
    } finally {
      conn.release();
    }
  })
);
router.post(
  "/cart/items",
  asyncRoute(async (req, res) => {
    const userId = Number(req.body?.user_id || 9);
    const { variant_id, quantity, selling_mode } = req.body || {};

    if (!variant_id) {
      return res.status(400).json({
        success: false,
        message: "variant_id wajib diisi.",
      });
    }

    if (!["retail", "b2b", "package"].includes(selling_mode)) {
      return res.status(400).json({
        success: false,
        message: "selling_mode wajib berupa retail, b2b, atau package.",
      });
    }

    const conn = await db.getConnection();
    try {
      const [variants] = await conn.execute(
        `SELECT pv.id, pv.product_id, pv.sales_mode, pv.selling_unit,
                pv.quantity_step, pv.price, pv.retail_price, pv.b2b_price,
                pv.min_retail_kg, pv.min_b2b_kg,
                pv.retail_step_kg, pv.b2b_step_kg,
                p.brand AS product_brand
         FROM product_variants pv
         JOIN products p ON p.id = pv.product_id
         WHERE pv.id = ? AND pv.is_active = 1
         LIMIT 1`,
        [variant_id]
      );

      if (!variants.length) {
        return res.status(404).json({
          success: false,
          message: "Variant tidak ditemukan atau tidak aktif.",
        });
      }

      const variant = variants[0];
      const policy = resolvePolicy(variant, selling_mode);
      const qtyError = validateQty(quantity, policy);

      if (qtyError) {
        return res.status(400).json({
          success: false,
          message: qtyError,
        });
      }

      const qty = Number(quantity);
      const cartId = await getOrCreateActiveCart(conn, userId);

      const [existingItems] = await conn.execute(
        `SELECT quantity
         FROM cart_items
         WHERE cart_id = ? AND variant_id = ? AND selling_mode = ?
         LIMIT 1`,
        [cartId, variant_id, selling_mode]
      );

      const existingQty = existingItems.length
        ? Number(existingItems[0].quantity)
        : 0;
      const combinedQty = existingQty + qty;
      const combinedError = validateQty(combinedQty, policy);

      if (combinedError) {
        return res.status(400).json({
          success: false,
          message: `Jumlah akhir di keranjang tidak valid: ${combinedError}`,
        });
      }

      // Validasi stok sebelum menambahkan item ke cart.
      const [inventoryRows] = await conn.execute(
        `SELECT
           GREATEST(
             COALESCE(quantity_on_hand, 0) -
             COALESCE(quantity_reserved, 0), 0
           ) AS available_stock
         FROM inventory
         WHERE variant_id = ?
         LIMIT 1`,
        [variant_id]
      );

      const availableStock = inventoryRows.length
        ? Number(inventoryRows[0].available_stock)
        : 0;

      if (!Number.isFinite(availableStock) || availableStock < combinedQty) {
        return res.status(400).json({
          success: false,
          message: `Stok tidak cukup. Tersedia: ${
            Number.isFinite(availableStock) && availableStock >= 0
              ? availableStock
              : 0
          } ${policy.unit}.`,
          data: {
            variant_id,
            selling_mode: policy.mode,
            requested_cart_quantity: combinedQty,
            available_stock:
              Number.isFinite(availableStock) && availableStock >= 0
                ? availableStock
                : 0
          }
        });
      }

      await conn.execute(
        `INSERT INTO cart_items
           (cart_id, variant_id, selling_mode, quantity)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           quantity = quantity + VALUES(quantity),
           updated_at = NOW()`,
        [cartId, variant_id, selling_mode, qty]
      );

      return res.status(201).json({
        success: true,
        message: "Item ditambahkan ke cart.",
        data: {
          cart_id: cartId,
          variant_id,
          added_quantity: qty,
          cart_quantity: combinedQty,
          selling_mode: policy.mode,
          selling_unit: policy.unit,
          applied_price: policy.price,
          min_qty: policy.minQty,
          step: policy.step,
        },
      });
    } finally {
      conn.release();
    }
  })
);// ============================================================
// PATCH /api/v1/cart/items/:id
// ============================================================
router.patch(
  "/cart/items/:id",
  asyncRoute(async (req, res) => {
    const userId = Number(req.body?.user_id || 9);
    const itemId = Number(req.params.id);
    const { quantity } = req.body || {};

    if (!Number.isSafeInteger(userId) || userId <= 0 ||
        !Number.isSafeInteger(itemId) || itemId <= 0) {
      return res.status(400).json({
        success: false,
        message: "user_id atau ID item tidak valid."
      });
    }

    const conn = await db.getConnection();
    try {
      const [rows] = await conn.execute(
        `SELECT
          ci.id, ci.quantity AS old_quantity, ci.selling_mode,
          pv.id AS variant_id, pv.sales_mode, pv.selling_unit,
          pv.quantity_step, pv.price, pv.retail_price, pv.b2b_price,
          pv.min_retail_kg, pv.min_b2b_kg,
          pv.retail_step_kg, pv.b2b_step_kg,
          p.name AS product_name, p.brand AS product_brand,
          GREATEST(
            COALESCE(inv.quantity_on_hand, 0) -
            COALESCE(inv.quantity_reserved, 0), 0
          ) AS available_stock
         FROM cart_items ci
         JOIN carts c ON c.id = ci.cart_id
         JOIN product_variants pv ON pv.id = ci.variant_id
         JOIN products p ON p.id = pv.product_id
         LEFT JOIN inventory inv ON inv.variant_id = pv.id
         WHERE ci.id = ? AND c.user_id = ? AND c.status = 'active'
         LIMIT 1`,
        [itemId, userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Item tidak ditemukan di cart Anda."
        });
      }

      const item = rows[0];
      const policy = resolvePolicy(item, item.selling_mode);
      const qtyError = validateQty(quantity, policy);

      if (qtyError) {
        return res.status(400).json({ success: false, message: qtyError });
      }

      const qty = Number(quantity);
      const stock = Number(item.available_stock);

      if (!Number.isFinite(stock) || stock < 0 || qty > stock) {
        return res.status(400).json({
          success: false,
          message: `Stok "${item.product_name}" tidak cukup. Tersedia: ${
            Number.isFinite(stock) && stock >= 0 ? stock : 0
          } ${policy.unit}.`
        });
      }

      await conn.execute(
        `UPDATE cart_items
         SET quantity = ?, updated_at = NOW()
         WHERE id = ?`,
        [qty, itemId]
      );

      return res.json({
        success: true,
        message: "Quantity diupdate.",
        data: {
          id: itemId,
          variant_id: item.variant_id,
          quantity: qty,
          selling_mode: item.selling_mode,
          selling_unit: policy.unit,
          mode: policy.mode,
          price: policy.price,
          available_stock: stock,
          line_total: Math.round(policy.price * qty * 100) / 100
        }
      });
    } finally {
      conn.release();
    }
  })
);
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


