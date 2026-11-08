const express = require("express");
const db = require("../db");

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

// GET /api/v1/shipments
router.get(
  "/shipments",
  asyncRoute(async (req, res) => {
    const businessId = 1;

    const [rows] = await db.execute(
      `SELECT 
        s.id, s.order_id, s.courier, s.service_name, s.tracking_number,
        s.status, s.shipping_cost, s.shipped_at, s.delivered_at,
        o.order_number, o.public_id AS order_public_id,
        o.shipping_address
       FROM shipments s
       JOIN orders o ON o.id = s.order_id
       WHERE s.business_id = ?
       ORDER BY s.created_at DESC, s.id DESC`,
      [businessId]
    );

    res.json({
      success: true,
      data: rows.map((r) => {
        let city = null;
        try {
          const addr = JSON.parse(r.shipping_address || "{}");
          city = addr.city || null;
        } catch (_) {}

        return {
          id: r.id,
          order_number: r.order_number,
          order_public_id: r.order_public_id,
          courier: r.courier,
          service_name: r.service_name,
          tracking_number: r.tracking_number,
          status: r.status,
          shipping_cost: Number(r.shipping_cost),
          shipped_at: r.shipped_at,
          delivered_at: r.delivered_at,
          destination_city: city,
        };
      }),
    });
  })
);

module.exports = router;
