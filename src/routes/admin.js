const express = require("express");
const router = express.Router();
const db = require("../db");

// GET /api/v1/admin/dashboard — statistik platform
router.get("/dashboard", async (req, res) => {
  try {
    const [tenants] = await db.execute("SELECT COUNT(*) AS total FROM businesses WHERE status = 'active'");
    const [products] = await db.execute("SELECT COUNT(*) AS total FROM products");
    const [orders] = await db.execute("SELECT COUNT(*) AS total FROM orders");
    const [couriers] = await db.execute("SELECT COUNT(*) AS total FROM couriers");
    const [couriersPending] = await db.execute("SELECT COUNT(*) AS total FROM couriers WHERE status = 'pending'");
    const [revenue] = await db.execute("SELECT COALESCE(SUM(grand_total), 0) AS total FROM orders WHERE status = 'completed'");

    res.json({
      success: true,
      data: {
        total_tenants: tenants[0].total,
        total_products: products[0].total,
        total_orders: orders[0].total,
        total_couriers: couriers[0].total,
        couriers_pending: couriersPending[0].total,
        total_revenue: revenue[0].total,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/admin/tenants — list tenant
router.get("/tenants", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT id, public_id, business_name, slug, business_type, city, province,
             verification_status, status, created_at
      FROM businesses
      ORDER BY created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/admin/orders — list order
router.get("/orders", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT o.id, o.order_number, o.status, o.grand_total, o.shipping_address,
             o.created_at, o.shipping_distance_km
      FROM orders o
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/v1/admin/shipments — list shipment (dari orders + courier_routes)
router.get("/shipments", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT 
        o.order_number AS code,
        o.order_number AS order,
        o.status,
        o.grand_total AS amount,
        o.shipping_address,
        o.created_at,
        cr.route_code,
        cr.area,
        cr.courier_id,
        cr.status AS route_status
      FROM orders o
      LEFT JOIN courier_routes cr ON JSON_CONTAINS(cr.order_ids, CAST(o.id AS JSON))
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
