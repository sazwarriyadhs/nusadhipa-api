const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/require-auth");
const requireBusiness = require("../middleware/require-business");

const router = express.Router();

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}

function validDate(value) {
  return typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00`));
}

router.get("/reports/financial", requireAuth, requireBusiness, asyncRoute(async (req, res) => {
  const businessId = Number(req.business.id);
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  const from = req.query.from || defaultFrom;
  const to = req.query.to || defaultTo;

  if (!validDate(from) || !validDate(to) || from > to) {
    return res.status(400).json({ success: false, message: "Periode laporan tidak valid." });
  }

  const dateFilter = `
    oi.business_id = ?
    AND o.placed_at >= ?
    AND o.placed_at < DATE_ADD(?, INTERVAL 1 DAY)
  `;
  const dateParams = [businessId, from, to];

  const [summary] = await db.execute(
    `SELECT
      COUNT(DISTINCT o.id) AS total_orders,
      COALESCE(SUM(oi.line_total), 0) AS total_sales,
      COALESCE(SUM(oi.discount_amount), 0) AS total_discount,
      COALESCE(SUM(oi.line_total - oi.discount_amount), 0) AS total_revenue
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE ${dateFilter}`,
    dateParams
  );

  const [byStatus] = await db.execute(
    `SELECT o.status, COUNT(DISTINCT o.id) AS count,
            COALESCE(SUM(oi.line_total - oi.discount_amount), 0) AS total
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE ${dateFilter}
     GROUP BY o.status`,
    dateParams
  );

  const [transactions] = await db.execute(
    `SELECT o.order_number, o.status, o.placed_at,
            COALESCE(SUM(oi.line_total - oi.discount_amount), 0) AS grand_total,
            u.full_name AS buyer_name, COUNT(oi.id) AS items_count
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     LEFT JOIN users u ON u.id = o.buyer_user_id
     WHERE ${dateFilter}
     GROUP BY o.id, o.order_number, o.status, o.placed_at, u.full_name
     ORDER BY o.placed_at DESC, o.id DESC`,
    dateParams
  );

  const [topProducts] = await db.execute(
    `SELECT oi.product_name, oi.variant_name,
            SUM(oi.quantity) AS total_qty,
            SUM(oi.line_total - oi.discount_amount) AS total_sales
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE ${dateFilter}
     GROUP BY oi.product_name, oi.variant_name
     ORDER BY total_sales DESC LIMIT 10`,
    dateParams
  );

  const [daily] = await db.execute(
    `SELECT DATE(o.placed_at) AS date,
            COUNT(DISTINCT o.id) AS orders,
            COALESCE(SUM(oi.line_total - oi.discount_amount), 0) AS total
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     WHERE ${dateFilter}
     GROUP BY DATE(o.placed_at)
     ORDER BY date ASC`,
    dateParams
  );

  res.json({
    success: true,
    data: {
      period: { from, to },
      financial_scope: "tenant_items_only",
      excludes: ["shipping_allocation", "platform_fee_allocation", "tax_allocation", "payment_settlement"],
      summary: {
        total_orders: Number(summary[0].total_orders),
        total_sales: Number(summary[0].total_sales),
        total_discount: Number(summary[0].total_discount),
        total_shipping: 0,
        total_revenue: Number(summary[0].total_revenue),
      },
      by_status: byStatus.map((r) => ({ status: r.status, count: Number(r.count), total: Number(r.total) })),
      transactions: transactions.map((t) => ({
        order_number: t.order_number, status: t.status, placed_at: t.placed_at,
        grand_total: Number(t.grand_total), buyer_name: t.buyer_name, items_count: Number(t.items_count),
      })),
      top_products: topProducts.map((p) => ({
        product_name: p.product_name, variant_name: p.variant_name,
        total_qty: Number(p.total_qty), total_sales: Number(p.total_sales),
      })),
      daily_sales: daily.map((d) => ({
        date: d.date, orders: Number(d.orders), total: Number(d.total),
      })),
    },
  });
}));

module.exports = router;