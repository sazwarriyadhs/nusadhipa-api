const express = require("express");
const db = require("../db");

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

// GET /api/v1/orders
// Daftar pesanan untuk tenant (business_id = 1, sementara hardcode)
router.get(
  "/orders",
  asyncRoute(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const status = req.query.status?.trim() || null;

    // Sementara: business_id = 1
    const businessId = 1;

    const conditions = ["oi.business_id = ?"];
    const params = [businessId];

    if (status && status !== "all") {
      conditions.push("o.status = ?");
      params.push(status);
    }

    const where = conditions.join(" AND ");

    const [countRows] = await db.execute(
      `SELECT COUNT(DISTINCT o.id) AS total
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE ${where}`,
      params
    );

    const [rows] = await db.execute(
      `SELECT 
        o.id,
        o.public_id,
        o.order_number,
        o.status,
        o.currency,
        o.grand_total,
        o.subtotal,
        o.shipping_total,
        o.shipping_distance_km,
        o.shipping_lat,
        o.shipping_lng,
        o.placed_at,
        o.paid_at,
        o.completed_at,
        u.full_name AS buyer_name,
        u.email AS buyer_email,
        COUNT(oi.id) AS items_count,
        SUM(oi.quantity) AS total_quantity
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN users u ON u.id = o.buyer_user_id
       WHERE ${where}
       GROUP BY o.id
       ORDER BY o.placed_at DESC, o.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const total = Number(countRows[0].total);

    res.json({
      success: true,
      data: rows.map((r) => ({
        public_id: r.public_id,
        order_number: r.order_number,
        status: r.status,
        currency: r.currency,
        grand_total: Number(r.grand_total),
        subtotal: Number(r.subtotal),
        shipping_total: Number(r.shipping_total),
        shipping_distance_km: r.shipping_distance_km != null
          ? Number(r.shipping_distance_km)
          : null,
        shipping_lat: r.shipping_lat != null ? Number(r.shipping_lat) : null,
        shipping_lng: r.shipping_lng != null ? Number(r.shipping_lng) : null,
        placed_at: r.placed_at,
        paid_at: r.paid_at,
        completed_at: r.completed_at,
        buyer_name: r.buyer_name || "Pembeli",
        buyer_email: r.buyer_email,
        items_count: Number(r.items_count),
        total_quantity: Number(r.total_quantity),
      })),
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  })
);

// GET /api/v1/orders/:publicId
// Detail pesanan
router.get(
  "/orders/:publicId",
  asyncRoute(async (req, res) => {
    const businessId = 1;
    const publicId = req.params.publicId;

    const [orders] = await db.execute(
      `SELECT 
        o.id, o.public_id, o.order_number, o.status, o.currency,
        o.subtotal, o.discount_total, o.shipping_total, o.tax_total,
        o.platform_fee, o.grand_total, o.shipping_address, o.customer_note,
        o.shipping_distance_km, o.shipping_lat, o.shipping_lng,
        o.placed_at, o.paid_at, o.completed_at,
        u.full_name AS buyer_name, u.email AS buyer_email
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_user_id
       WHERE o.public_id = ?
       LIMIT 1`,
      [publicId]
    );

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Pesanan tidak ditemukan.",
      });
    }

    const order = orders[0];

    const [items] = await db.execute(
      `SELECT 
        product_name, variant_name, sku,
        quantity, unit_price, line_total
       FROM order_items
       WHERE order_id = ? AND business_id = ?
       ORDER BY id ASC`,
      [order.id, businessId]
    );

    res.json({
      success: true,
      data: {
        public_id: order.public_id,
        order_number: order.order_number,
        status: order.status,
        currency: order.currency,
        subtotal: Number(order.subtotal),
        discount_total: Number(order.discount_total),
        shipping_total: Number(order.shipping_total),
        grand_total: Number(order.grand_total),
        shipping_address: order.shipping_address,
        shipping_distance_km: order.shipping_distance_km != null
          ? Number(order.shipping_distance_km)
          : null,
        shipping_lat: order.shipping_lat != null
          ? Number(order.shipping_lat)
          : null,
        shipping_lng: order.shipping_lng != null
          ? Number(order.shipping_lng)
          : null,
        customer_note: order.customer_note,
        placed_at: order.placed_at,
        paid_at: order.paid_at,
        completed_at: order.completed_at,
        buyer_name: order.buyer_name,
        buyer_email: order.buyer_email,
        items: items.map((it) => ({
          product_name: it.product_name,
          variant_name: it.variant_name,
          sku: it.sku,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          line_total: Number(it.line_total),
        })),
      },
    });
  })
);


// ============================================================
// POST /api/v1/orders — Buat order baru
// ============================================================
router.post(
  "/orders",
  asyncRoute(async (req, res) => {
    const businessId = 1; // sementara

    // Buyer: pakai user_id dari request (kalau ada), atau guest buyer
    let buyerUserId = Number(req.body?.buyer_user_id) || null;
    if (!buyerUserId) {
      const [guests] = await db.execute(
        "SELECT id FROM users WHERE email = 'guest.buyer@nusadhipa.shop' LIMIT 1"
      );
      buyerUserId = guests.length > 0 ? guests[0].id : 1;
    }

    const {
      items,
      shipping_address,
      courier,
      shipping_distance_km,
      customer_note,
    } = req.body || {};

    // ===== VALIDASI =====
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Item pesanan wajib diisi.",
      });
    }

    if (
      !shipping_address ||
      typeof shipping_address !== "object" ||
      !shipping_address.name ||
      !shipping_address.phone
    ) {
      return res.status(400).json({
        success: false,
        message: "Alamat pengiriman tidak lengkap.",
      });
    }

    // ===== AMBIL DETAIL VARIANT =====
    const requestedVariantIds = items
      .map((it) => Number(it.variant_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (requestedVariantIds.length !== items.length) {
      return res.status(400).json({
        success: false,
        message: "Variant ID tidak valid.",
      });
    }

    // Satu baris per varian pada query SQL IN, meskipun
    // pesanan memiliki beberapa item dengan variant_id sama.
    const variantIds = [...new Set(requestedVariantIds)];

    const placeholders = variantIds.map(() => "?").join(",");
    const [variants] = await db.execute(
      `SELECT 
        pv.id, pv.product_id, pv.variant_name, pv.sku, pv.price,
        pv.sales_mode, pv.selling_unit, pv.quantity_step, pv.weight_grams,
        pv.retail_price, pv.b2b_price,
        pv.min_retail_kg, pv.min_b2b_kg,
        pv.retail_step_kg, pv.b2b_step_kg,
        p.name AS product_name, p.brand AS product_brand, p.business_id,
        COALESCE(inv.quantity_on_hand, 0) - COALESCE(inv.quantity_reserved, 0) AS available_stock
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN inventory inv ON inv.variant_id = pv.id
       WHERE pv.id IN (${placeholders}) AND pv.is_active = 1`,
      variantIds
    );

    if (variants.length !== variantIds.length) {
      return res.status(400).json({
        success: false,
        message: "Salah satu varian tidak ditemukan.",
      });
    }

    // ===== HITUNG SUBTOTAL + VALIDASI STOK =====
    let subtotal = 0;
    let totalWeight = 0;
    const orderItems = [];

    // Ambil customer_type buyer
    // Mode penjualan ditentukan eksplisit pada setiap item order.

    for (const item of items) {
      const variant = variants.find((v) => v.id === Number(item.variant_id));
      if (!variant) continue;

      if (!["package", "weight"].includes(variant.sales_mode)) {
        return res.status(400).json({
          success: false,
          message: `Varian "${variant.product_name}" belum diklasifikasikan untuk penjualan.`,
        });
      }

      const isPackage = variant.sales_mode === "package";
      const isKg = variant.selling_unit === "kg";
      if ((isPackage && isKg) || (!isPackage && !isKg)) {
        return res.status(400).json({
          success: false,
          message: `Konfigurasi satuan varian "${variant.product_name}" tidak valid.`,
        });
      }

      let minQty, step, price, unit;

      const requestedMode = item.selling_mode;

      if (!["retail", "b2b", "package"].includes(requestedMode)) {
        return res.status(400).json({
          success: false,
          message: "selling_mode wajib diisi: retail, b2b, atau package.",
        });
      }

      if (isPackage) {
        if (requestedMode !== "package") {
          return res.status(400).json({
            success: false,
            message: `Produk kemasan "${variant.product_name}" wajib menggunakan mode package.`,
          });
        }

        minQty = 1;
        step = 1;
        price = Number(variant.retail_price ?? variant.price);
        unit = "unit";
      } else {
        if (requestedMode === "package") {
          return res.status(400).json({
            success: false,
            message: `Produk timbang "${variant.product_name}" tidak mendukung mode package.`,
          });
        }

        const isSauriFresh =
          String(variant.product_brand || "").trim().toUpperCase() === "SAURI FRESH";

        const minRetail = isSauriFresh ? 1 : Number(variant.min_retail_kg ?? 0.5);
        const minB2B = isSauriFresh ? 100 : Number(variant.min_b2b_kg ?? 50);
        const stepRetail = Number(variant.retail_step_kg ?? 0.5);
        const stepB2B = Number(variant.b2b_step_kg ?? 1);
        const priceRetail = Number(variant.retail_price ?? variant.price);
        const priceB2B =
          variant.b2b_price == null ? null : Number(variant.b2b_price);

        if (requestedMode === "b2b") {
          minQty = minB2B;
          step = stepB2B;
          price = priceB2B;

          if (price === null || !Number.isFinite(price) || price <= 0) {
            return res.status(400).json({
              success: false,
              message: `Harga B2B "${variant.product_name}" belum ditetapkan.`,
            });
          }
        } else {
          minQty = minRetail;
          step = stepRetail;
          price = priceRetail;

          if (isSauriFresh && Number(item.quantity) > 99) {
            return res.status(400).json({
              success: false,
              message: "SAURI FRESH retail maksimal 99 kg. Mulai 100 kg wajib menggunakan mode B2B.",
            });
          }
        }

        unit = "kg";
      }

      const rawQty = item.quantity;
      if (rawQty === undefined || rawQty === null || rawQty === "" || typeof rawQty === "boolean") {
        return res.status(400).json({ success: false, message: "Quantity wajib berupa angka positif." });
      }

      const qty = Number(rawQty);
      if (!Number.isFinite(qty) || qty <= 0) {
        return res.status(400).json({ success: false, message: "Quantity wajib berupa angka positif." });
      }
      if (!Number.isFinite(minQty) || minQty <= 0 ||
          !Number.isFinite(step) || step <= 0) {
        return res.status(400).json({ success: false, message: "Aturan quantity varian tidak valid." });
      }
      if (qty < minQty) {
        return res.status(400).json({
          success: false,
          message: `Minimum pembelian "${variant.product_name}" adalah ${minQty} ${unit}.`,
        });
      }
      if (Math.abs(qty / step - Math.round(qty / step)) > 1e-8 ||
          (unit !== "kg" && !Number.isInteger(qty))) {
        return res.status(400).json({
          success: false,
          message: `Quantity "${variant.product_name}" harus mengikuti kelipatan ${step} ${unit}.`,
        });
      }
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({
          success: false,
          message: `Harga "${variant.product_name}" belum ditetapkan.`,
        });
      }

      if (qty > Number(variant.available_stock)) {
        return res.status(400).json({
          success: false,
          message: `Stok "${variant.product_name}" tidak cukup. Tersedia: ${variant.available_stock} ${unit}`,
        });
      }

      const lineTotal = Math.round(price * qty * 100) / 100;
      subtotal += lineTotal;
      totalWeight += unit === "kg"
        ? qty * 1000
        : qty * (Number(variant.weight_grams) || 0);

      orderItems.push({ selling_mode: isPackage ? "package" : requestedMode, variant_id: variant.id,
        product_id: variant.product_id,
        product_name: variant.product_name,
        product_brand: variant.product_brand,
        variant_name: variant.variant_name,
        sku: variant.sku,
        unit_price: price,
        quantity: qty,
        line_total: lineTotal,
        business_id: variant.business_id,
        selling_unit: unit,
      });
    }

    // Batas retail SAURI FRESH berlaku pada total seluruh baris
    // untuk varian yang sama, bukan hanya setiap baris satu per satu.
    const sauriFreshRetailByVariant = new Map();

    for (const item of orderItems) {
      if (
        String(item.product_brand || "").trim().toUpperCase() === "SAURI FRESH" &&
        item.selling_mode === "retail"
      ) {
        const variantId = Number(item.variant_id);
        const total = (sauriFreshRetailByVariant.get(variantId) || 0) +
          Number(item.quantity);

        sauriFreshRetailByVariant.set(variantId, total);

        if (total > 99) {
          return res.status(400).json({
            success: false,
            message: `SAURI FRESH retail untuk varian ${variantId} maksimal 99 kg total. Mulai 100 kg wajib menggunakan mode B2B.`,
          });
        }
      }
    }

    // ===== HITUNG ONGKIR =====
    const distance = Number(shipping_distance_km) || 0;
    const FREE_RADIUS = 5;
    const BASE_COST = 5000;
    const COST_PER_KM = 2000;
    const shippingTotal = distance <= FREE_RADIUS
      ? 0
      : Math.round(BASE_COST + (distance - FREE_RADIUS) * COST_PER_KM);

    const grandTotal = subtotal + shippingTotal;

    // ===== INSERT ORDER =====
    const crypto = require("crypto");
    const publicId = crypto.randomUUID();
    const now = new Date();
    const orderNumber = `ORD-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;

    const shippingAddressJson = JSON.stringify(shipping_address);

    const conn = await db.getConnection();
    let orderId;
    try {
      await conn.beginTransaction();

      // Kunci stok di dalam transaksi agar checkout bersamaan tidak oversell.
      const lockIds = [...new Set(variantIds)].sort((a, b) => a - b);
      const lockPlaceholders = lockIds.map(() => "?").join(",");
      const [lockedInventory] = await conn.execute(
        `SELECT variant_id, quantity_on_hand, quantity_reserved
         FROM inventory
         WHERE variant_id IN (${lockPlaceholders})
         ORDER BY variant_id
         FOR UPDATE`,
        lockIds
      );

      const inventoryByVariant = new Map(
        lockedInventory.map((row) => [
          Number(row.variant_id),
          Number(row.quantity_on_hand) - Number(row.quantity_reserved),
        ])
      );

      // Gabungkan quantity dari semua baris yang memakai varian sama.
      // Validasi dilakukan setelah SELECT ... FOR UPDATE.
      const requestedQtyByVariant = new Map();

      for (const item of orderItems) {
        const variantId = Number(item.variant_id);
        const qty = Number(item.quantity);

        requestedQtyByVariant.set(
          variantId,
          (requestedQtyByVariant.get(variantId) || 0) + qty
        );
      }

      for (const [variantId, requestedQty] of requestedQtyByVariant) {
        const available = inventoryByVariant.get(variantId);

        if (available === undefined || !Number.isFinite(available) ||
            available < 0 || requestedQty > available) {
          const error = new Error(
            available === undefined
              ? `Data stok varian ${variantId} belum tersedia.`
              : `Stok varian ${variantId} tidak cukup untuk total pesanan ${requestedQty}. Tersedia: ${available}.`
          );
          error.statusCode = 400;
          throw error;
        }
      }

      const [orderResult] = await conn.execute(
        `INSERT INTO orders (
          public_id, order_number, buyer_user_id, status, currency,
          subtotal, discount_total, shipping_total, tax_total, platform_fee,
          grand_total, shipping_address, customer_note, placed_at, shipping_distance_km
        ) VALUES (?, ?, ?, 'pending_payment', 'IDR', ?, 0, ?, 0, 0, ?, ?, ?, ?, ?)`,
        [
          publicId, orderNumber, buyerUserId,
          subtotal, shippingTotal, grandTotal,
          shippingAddressJson, customer_note || null, now,
          distance || null,
        ]
      );
      orderId = orderResult.insertId;

      for (const item of orderItems) {
        await conn.execute(
          `INSERT INTO order_items (
            order_id, business_id, product_id, variant_id, selling_mode, product_name, variant_name, sku, quantity, unit_price, discount_amount, line_total ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          [
            orderId, item.business_id, item.product_id, item.variant_id, item.selling_mode, item.product_name, item.variant_name, item.sku, item.quantity, item.unit_price, item.line_total,
          ]
        );

        // Inventory wajib sudah ada dan dikunci pada awal transaksi.
// Jangan pernah membuat stok otomatis saat checkout.
        const [updResult] = await conn.execute(
          `UPDATE inventory
           SET quantity_reserved = quantity_reserved + ?,
               updated_at = NOW()
           WHERE variant_id = ?
             AND quantity_on_hand - quantity_reserved >= ?`,
          [item.quantity, item.variant_id, item.quantity]
        );

        if (updResult.affectedRows !== 1) {
          throw new Error(
            `Inventory hilang atau stok tidak cukup untuk varian ${item.variant_id}`
          );
        }
      }

      await conn.commit();
    } catch (err) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error("Rollback checkout gagal:", rollbackErr);
      }

      conn.release();
      console.error("Checkout transaction failed:", err);
      return res.status(err.statusCode || 500).json({
        success: false,
        message: err.statusCode === 400
          ? err.message
          : "Gagal membuat pesanan.",
      });
    }
    conn.release();

    res.status(201).json({
      success: true,
      message: "Pesanan berhasil dibuat.",
      data: {
        public_id: publicId,
        order_number: orderNumber,
        grand_total: grandTotal,
        subtotal,
        shipping_total: shippingTotal,
        items_count: orderItems.length,
        total_weight: totalWeight,
      },
    });
  })
);

// ============================================================
// PATCH /api/v1/orders/:publicId/status — Update status order
// ============================================================
router.patch(
  "/orders/:publicId/status",
  asyncRoute(async (req, res) => {
    const publicId = req.params.publicId;
    const { status } = req.body || {};

    const transitions = {
      pending_payment: ["paid", "cancelled"],
      paid: ["processing"],
      processing: ["partially_shipped", "shipped"],
      partially_shipped: ["shipped", "completed"],
      shipped: ["completed"],
      completed: [],
      cancelled: [],
      refunded: [],
    };

    if (typeof status !== "string" ||
        !Object.prototype.hasOwnProperty.call(transitions, status)) {
      return res.status(400).json({
        success: false,
        message: "Status tidak valid.",
      });
    }

    const conn = await db.getConnection();
    let transactionStarted = false;

    try {
      await conn.beginTransaction();
      transactionStarted = true;

      const [orders] = await conn.execute(
        `SELECT id, status, paid_at, completed_at, cancelled_at
         FROM orders
         WHERE public_id = ?
         LIMIT 1
         FOR UPDATE`,
        [publicId]
      );

      if (orders.length === 0) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(404).json({
          success: false,
          message: "Order tidak ditemukan.",
        });
      }

      const order = orders[0];
      const prevStatus = order.status;

      if (status === prevStatus) {
        await conn.commit();
        transactionStarted = false;
        return res.json({
          success: true,
          message: "Order sudah memiliki status tersebut.",
          data: { public_id: publicId, status: prevStatus },
        });
      }

      if (!transitions[prevStatus]?.includes(status)) {
        await conn.rollback();
        transactionStarted = false;
        return res.status(409).json({
          success: false,
          message: `Transisi status ${prevStatus} ke ${status} tidak diizinkan.`,
          data: { public_id: publicId, current_status: prevStatus },
        });
      }

      // Tidak mengubah stok sampai ledger dan reservasi direkonsiliasi.
      const updates = ["status = ?", "updated_at = NOW()"];

      if (status === "paid" && !order.paid_at) {
        updates.push("paid_at = NOW()");
      }
      if (status === "completed" && !order.completed_at) {
        updates.push("completed_at = NOW()");
      }
      if (status === "cancelled" && !order.cancelled_at) {
        updates.push("cancelled_at = NOW()");
      }

      await conn.execute(
        `UPDATE orders SET ${updates.join(", ")} WHERE id = ?`,
        [status, order.id]
      );

      await conn.commit();
      transactionStarted = false;

      return res.json({
        success: true,
        message: "Status order berhasil diupdate.",
        data: {
          public_id: publicId,
          previous_status: prevStatus,
          status,
          inventory_updated: false,
        },
      });
    } catch (err) {
      if (transactionStarted) {
        try {
          await conn.rollback();
        } catch (rollbackErr) {
          console.error("Rollback status order gagal:", rollbackErr);
        }
      }

      console.error("Update status error:", err);
      return res.status(500).json({
        success: false,
        message: "Gagal update status.",
      });
    } finally {
      conn.release();
    }
  })
);
module.exports = router;
