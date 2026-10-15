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
    const variantIds = items
      .map((it) => Number(it.variant_id))
      .filter((id) => Number.isFinite(id) && id > 0);

    if (variantIds.length !== items.length) {
      return res.status(400).json({
        success: false,
        message: "Variant ID tidak valid.",
      });
    }

    const placeholders = variantIds.map(() => "?").join(",");
    const [variants] = await db.execute(
      `SELECT 
        pv.id, pv.product_id, pv.variant_name, pv.sku, pv.price,
        p.name AS product_name, p.business_id,
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

    for (const item of items) {
      const variant = variants.find((v) => v.id === Number(item.variant_id));
      const qty = Math.max(1, Math.floor(Number(item.quantity) || 1));

      if (qty > Number(variant.available_stock)) {
        return res.status(400).json({
          success: false,
          message: `Stok "${variant.product_name}" tidak cukup. Tersedia: ${variant.available_stock}`,
        });
      }

      const price = Number(variant.price);
      const lineTotal = price * qty;
      subtotal += lineTotal;
      totalWeight += qty; // asumsi 1 unit = 1 kg

      orderItems.push({
        variant_id: variant.id,
        product_id: variant.product_id,
        product_name: variant.product_name,
        variant_name: variant.variant_name,
        sku: variant.sku,
        unit_price: price,
        quantity: qty,
        line_total: lineTotal,
        business_id: variant.business_id,
      });
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

    const [orderResult] = await db.execute(
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

    const orderId = orderResult.insertId;

    // ===== INSERT ORDER ITEMS =====
    for (const item of orderItems) {
      await db.execute(
        `INSERT INTO order_items (
          order_id, business_id, product_id, variant_id,
          product_name, variant_name, sku,
          quantity, unit_price, discount_amount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          orderId, item.business_id, item.product_id, item.variant_id,
          item.product_name, item.variant_name, item.sku,
          item.quantity, item.unit_price, item.line_total,
        ]
      );
    }

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

    const allowedStatuses = [
      "pending_payment", "paid", "processing",
      "partially_shipped", "shipped", "completed",
      "cancelled", "refunded",
    ];

    if (!status || !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status tidak valid.",
      });
    }

    const [result] = await db.execute(
      `UPDATE orders SET status = ?, updated_at = NOW() WHERE public_id = ?`,
      [status, publicId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan.",
      });
    }

    res.json({
      success: true,
      message: "Status order berhasil diupdate.",
      data: { public_id: publicId, status },
    });
  })
);

module.exports = router;
