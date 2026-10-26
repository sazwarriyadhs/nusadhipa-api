
const express = require("express");
const requireAuth = require("../middleware/require-auth");
const router = express.Router();

// Semua endpoint admin hanya untuk superadmin aktif.

const db = require("../db");
const requireRole = require("../middleware/require-role");
router.use(requireAuth, requireRole("superadmin"));

// Helper: format respons error dan catat detail di log server.
function handleError(res, label, err) {
  console.error(`[ADMIN ${label}]`, err);

  return res.status(500).json({
    success: false,
    message: "Terjadi kesalahan saat mengambil data.",
  });
}

// GET /api/v1/admin/dashboard
router.get("/dashboard", async (req, res) => {
  try {
    const [tenants] = await db.execute(
      "SELECT COUNT(*) AS total FROM businesses WHERE status = 'active'"
    );
    const [products] = await db.execute(
      "SELECT COUNT(*) AS total FROM products"
    );
    const [orders] = await db.execute(
      "SELECT COUNT(*) AS total FROM orders"
    );
    const [couriers] = await db.execute(
      "SELECT COUNT(*) AS total FROM couriers"
    );
    const [couriersPending] = await db.execute(
      "SELECT COUNT(*) AS total FROM couriers WHERE status = 'pending'"
    );
    const [revenue] = await db.execute(
      "SELECT COALESCE(SUM(grand_total), 0) AS total FROM orders WHERE status = 'completed'"
    );

    res.json({
      success: true,
      data: {
        total_tenants: Number(tenants[0].total),
        total_products: Number(products[0].total),
        total_orders: Number(orders[0].total),
        total_couriers: Number(couriers[0].total),
        couriers_pending: Number(couriersPending[0].total),
        total_revenue: revenue[0].total,
      },
    });
  } catch (err) {
    return handleError(res, "DASHBOARD", err);
  }
});

// GET /api/v1/admin/tenants
router.get("/tenants", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        id,
        public_id,
        business_name,
        slug,
        business_type,
        city,
        province,
        verification_status,
        status,
        created_at
      FROM businesses
      ORDER BY created_at DESC
    `);

    return res.json({ success: true, data: rows });
  } catch (err) {
    return handleError(res, "TENANTS", err);
  }
});

// GET /api/v1/admin/orders
router.get("/orders", async (req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        o.id,
        o.order_number,
        o.status,
        o.grand_total,
        o.shipping_address,
        o.created_at,
        o.shipping_distance_km
      FROM orders o
      ORDER BY o.created_at DESC
      LIMIT 100
    `);

    return res.json({ success: true, data: rows });
  } catch (err) {
    return handleError(res, "ORDERS", err);
  }
});

// GET /api/v1/admin/shipments
// Pesanan tetap dapat ditampilkan meskipun data rute tidak tersedia.
router.get("/shipments", async (req, res) => {
  try {
    let rows;
    let routesAvailable = true;

    try {
      const [result] = await db.execute(`
        SELECT
          o.order_number AS code,
          o.order_number AS order_number,
          o.status,
          o.grand_total AS amount,
          o.shipping_address,
          o.created_at,
          cr.route_code,
          cr.area,
          cr.courier_id,
          cr.status AS route_status
        FROM orders o
        LEFT JOIN courier_routes cr
          ON JSON_CONTAINS(cr.order_ids, CAST(o.id AS JSON))
        ORDER BY o.created_at DESC
        LIMIT 100
      `);

      rows = result;
    } catch (routeErr) {
      // Fallback hanya untuk query shipment; jangan mengubah data.
      console.error("[ADMIN SHIPMENTS] Query rute gagal:", routeErr.message);
      routesAvailable = false;

      const [result] = await db.execute(`
        SELECT
          o.order_number AS code,
          o.order_number AS order_number,
          o.status,
          o.grand_total AS amount,
          o.shipping_address,
          o.created_at,
          NULL AS route_code,
          NULL AS area,
          NULL AS courier_id,
          NULL AS route_status
        FROM orders o
        ORDER BY o.created_at DESC
        LIMIT 100
      `);

      rows = result;
    }

    return res.json({
      success: true,
      data: rows,
      meta: {
        routes_available: routesAvailable,
      },
    });
  } catch (err) {
    return handleError(res, "SHIPMENTS", err);
  }
});

module.exports = router;
