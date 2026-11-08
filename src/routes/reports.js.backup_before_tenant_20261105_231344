const express = require("express");
const db = require("../db");

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

// GET /api/v1/reports/financial?from=2026-10-01&to=2026-10-31
router.get(
  "/reports/financial",
  asyncRoute(async (req, res) => {
    const businessId = 1;

    // Default: bulan ini
    const now = new Date();
    const from = req.query.from || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const to = req.query.to || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    // Summary
    const [summary] = await db.execute(
      `SELECT 
        COUNT(DISTINCT o.id) AS total_orders,
        COALESCE(SUM(oi.line_total), 0) AS total_sales,
        COALESCE(SUM(o.discount_total), 0) AS total_discount,
        COALESCE(SUM(o.shipping_total), 0) AS total_shipping,
        COALESCE(SUM(o.grand_total), 0) AS total_revenue
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.business_id = ?
         AND DATE(o.placed_at) >= ?
         AND DATE(o.placed_at) <= ?`,
      [businessId, from, to]
    );

    // Per status
    const [byStatus] = await db.execute(
      `SELECT o.status, COUNT(DISTINCT o.id) AS count,
              COALESCE(SUM(o.grand_total), 0) AS total
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.business_id = ?
         AND DATE(o.placed_at) >= ?
         AND DATE(o.placed_at) <= ?
       GROUP BY o.status`,
      [businessId, from, to]
    );

    // Detail transaksi
    const [transactions] = await db.execute(
      `SELECT 
        o.order_number, o.status, o.placed_at, o.grand_total,
        u.full_name AS buyer_name,
        COUNT(oi.id) AS items_count
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       LEFT JOIN users u ON u.id = o.buyer_user_id
       WHERE oi.business_id = ?
         AND DATE(o.placed_at) >= ?
         AND DATE(o.placed_at) <= ?
       GROUP BY o.id
       ORDER BY o.placed_at DESC`,
      [businessId, from, to]
    );

    // Top produk
    const [topProducts] = await db.execute(
      `SELECT 
        oi.product_name,
        oi.variant_name,
        SUM(oi.quantity) AS total_qty,
        SUM(oi.line_total) AS total_sales
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.business_id = ?
         AND DATE(o.placed_at) >= ?
         AND DATE(o.placed_at) <= ?
       GROUP BY oi.product_name, oi.variant_name
       ORDER BY total_sales DESC
       LIMIT 10`,
      [businessId, from, to]
    );

    // Sales harian
    const [daily] = await db.execute(
      `SELECT 
        DATE(o.placed_at) AS date,
        COUNT(DISTINCT o.id) AS orders,
        COALESCE(SUM(o.grand_total), 0) AS total
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.business_id = ?
         AND DATE(o.placed_at) >= ?
         AND DATE(o.placed_at) <= ?
       GROUP BY DATE(o.placed_at)
       ORDER BY date ASC`,
      [businessId, from, to]
    );

    res.json({
      success: true,
      data: {
        period: { from, to },
        summary: {
          total_orders: Number(summary[0].total_orders),
          total_sales: Number(summary[0].total_sales),
          total_discount: Number(summary[0].total_discount),
          total_shipping: Number(summary[0].total_shipping),
          total_revenue: Number(summary[0].total_revenue),
        },
        by_status: byStatus.map((r) => ({
          status: r.status,
          count: Number(r.count),
          total: Number(r.total),
        })),
        transactions: transactions.map((t) => ({
          order_number: t.order_number,
          status: t.status,
          placed_at: t.placed_at,
          grand_total: Number(t.grand_total),
          buyer_name: t.buyer_name,
          items_count: Number(t.items_count),
        })),
        top_products: topProducts.map((p) => ({
          product_name: p.product_name,
          variant_name: p.variant_name,
          total_qty: Number(p.total_qty),
          total_sales: Number(p.total_sales),
        })),
        daily_sales: daily.map((d) => ({
          date: d.date,
          orders: Number(d.orders),
          total: Number(d.total),
        })),
      },
    });
  })
);

module.exports = router;
