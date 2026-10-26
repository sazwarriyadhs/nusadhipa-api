const express = require("express");
const pool = require("../db");
const requireAuth = require("../middleware/require-auth");
const requireRole = require("../middleware/require-role");

const router = express.Router();

router.get(
  "/finance/dashboard",
  requireAuth,
  requireRole("superadmin"),
  async (_req, res, next) => {
    try {
      const [summaryRows] = await pool.execute(`
        SELECT
          COUNT(*) AS order_count,
          COALESCE(SUM(subtotal), 0) AS gmv,
          COALESCE(SUM(GREATEST(subtotal - discount_total, 0)), 0) AS merchandise_net,
          COALESCE(SUM(platform_fee), 0) AS platform_fee,
          COALESCE(SUM(shipping_total), 0) AS shipping_total,
          COALESCE(SUM(grand_total), 0) AS order_total,
          COALESCE(SUM(status = 'refunded'), 0) AS refunded_orders,
          COALESCE(SUM(status = 'cancelled'), 0) AS cancelled_orders
        FROM orders
        WHERE status IN (
          'paid', 'processing', 'partially_shipped', 'shipped', 'completed'
        )
      `);

      const [paymentRows] = await pool.execute(`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END), 0)
            AS succeeded_amount,
          COALESCE(SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END), 0)
            AS succeeded_count,
          COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0)
            AS refunded_amount,
          COALESCE(SUM(CASE WHEN status IN ('pending','processing') THEN amount ELSE 0 END), 0)
            AS pending_amount
        FROM payments
      `);

      const [businessRows] = await pool.execute(`
        SELECT
          b.id AS business_id,
          b.business_name,
          COALESCE(s.order_count, 0) AS order_count,
          COALESCE(s.gross_item_sales, 0) AS gross_item_sales
        FROM businesses b
        LEFT JOIN (
          SELECT
            oi.business_id,
            COUNT(DISTINCT o.id) AS order_count,
            COALESCE(SUM(oi.line_total), 0) AS gross_item_sales
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE o.status IN (
            'paid', 'processing', 'partially_shipped', 'shipped', 'completed'
          )
          GROUP BY oi.business_id
        ) s ON s.business_id = b.id
        ORDER BY gross_item_sales DESC, b.business_name ASC
      `);
      const [recentRows] = await pool.execute(`
        SELECT
          o.id,
          o.order_number,
          o.status AS order_status,
          o.currency,
          o.subtotal,
          o.discount_total,
          o.shipping_total,
          o.platform_fee,
          o.grand_total,
          o.created_at,
          COALESCE(p.payment_amount, 0) AS succeeded_payment_amount,
          COALESCE(p.succeeded_count, 0) AS succeeded_payment_count
        FROM orders o
        LEFT JOIN (
          SELECT order_id,
                 SUM(CASE WHEN status = 'succeeded' THEN amount ELSE 0 END)
                   AS payment_amount,
                 SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END)
                   AS succeeded_count
          FROM payments
          GROUP BY order_id
        ) p ON p.order_id = o.id
        ORDER BY o.created_at DESC
        LIMIT 100
      `);

      const summary = summaryRows[0];
      const payments = paymentRows[0];

      return res.json({
        success: true,
        generatedAt: new Date().toISOString(),
        definitions: {
          gmv: "Subtotal pesanan berstatus paid, processing, partially_shipped, shipped, atau completed; sebelum diskon.",
          platformFee: "Jumlah platform_fee yang tersimpan pada pesanan dengan status transaksi valid; bukan tarif perkiraan.",
          tenantSales: "Penjualan item berdasarkan line_total; belum dikurangi alokasi biaya platform dan bukan bukti settlement.",
          settlement: "Belum tersedia: skema pencairan tenant tidak teridentifikasi pada tabel yang diperiksa.",
          paymentReconciliation: "Membandingkan pembayaran succeeded per pesanan dengan grand_total; perbedaan perlu ditinjau, bukan otomatis dianggap kesalahan."
        },
        summary: {
          orderCount: Number(summary.order_count || 0),
          gmv: Number(summary.gmv || 0),
          merchandiseNet: Number(summary.merchandise_net || 0),
          platformFee: Number(summary.platform_fee || 0),
          shippingTotal: Number(summary.shipping_total || 0),
          orderTotal: Number(summary.order_total || 0),
          refundedOrders: Number(summary.refunded_orders || 0),
          cancelledOrders: Number(summary.cancelled_orders || 0)
        },
        payments: {
          succeededAmount: Number(payments.succeeded_amount || 0),
          succeededCount: Number(payments.succeeded_count || 0),
          refundedAmount: Number(payments.refunded_amount || 0),
          pendingAmount: Number(payments.pending_amount || 0)
        },
        settlement: {
          available: false,
          reason: "Belum ada data pencairan tenant yang terverifikasi dalam skema yang diperiksa."
        },
        businesses: businessRows.map((r) => ({
          businessId: String(r.business_id),
          businessName: r.business_name,
          orderCount: Number(r.order_count || 0),
          grossItemSales: Number(r.gross_item_sales || 0)
        })),
        recentOrders: recentRows.map((r) => ({
          id: String(r.id),
          orderNumber: r.order_number,
          status: r.order_status,
          currency: r.currency,
          subtotal: Number(r.subtotal || 0),
          discountTotal: Number(r.discount_total || 0),
          shippingTotal: Number(r.shipping_total || 0),
          platformFee: Number(r.platform_fee || 0),
          grandTotal: Number(r.grand_total || 0),
          succeededPaymentAmount: Number(r.succeeded_payment_amount || 0),
          succeededPaymentCount: Number(r.succeeded_payment_count || 0),
          createdAt: r.created_at
        }))
      });
    } catch (error) {
      return next(error);
    }
  }
);

module.exports = router;