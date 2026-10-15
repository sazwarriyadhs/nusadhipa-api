const pool = require("./src/db");
const crypto = require("crypto");

const SAMPLE_BUYERS = [
  { name: "Budi Santoso", city: "Jakarta Selatan" },
  { name: "Siti Nurhaliza", city: "Kota Bogor" },
  { name: "Ahmad Fauzi", city: "Depok" },
  { name: "Rina Wulandari", city: "Bandung" },
  { name: "Hendra Wijaya", city: "Tangerang" },
];

const STATUSES = [
  "pending_payment", "paid", "processing", "shipped", "completed",
];

(async () => {
  try {
    console.log("=== Hapus order lama ===");
    await pool.execute("DELETE FROM shipments");
    await pool.execute("DELETE FROM order_items");
    await pool.execute("DELETE FROM orders");
    console.log("✅ Order lama dihapus");

    const [customers] = await pool.execute(
      `SELECT id, full_name FROM users 
       WHERE email LIKE '%@demo.local' 
       ORDER BY id ASC LIMIT 5`
    );
    if (customers.length < 5) {
      console.log(`❌ Hanya ${customers.length} customer.`);
      process.exit(1);
    }
    console.log(`✅ ${customers.length} customer:`);
    customers.forEach(c => console.log(`   - ${c.full_name} (id=${c.id})`));

    const [variants] = await pool.execute(
      `SELECT pv.id AS variant_id, pv.product_id, pv.price, 
              pv.variant_name, pv.sku, p.name AS product_name, p.business_id
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.is_active = 1 LIMIT 10`
    );
    const businessId = variants[0].business_id;

    console.log("\n=== Insert orders baru ===");

    for (let i = 0; i < 5; i++) {
      const customer = customers[i];
      const buyer = SAMPLE_BUYERS[i];
      const status = STATUSES[i];
      const orderNumber = `ORD-${new Date().getFullYear()}-${String(i + 1).padStart(4, "0")}`;
      const publicId = crypto.randomUUID();

      const variant = variants[i % variants.length];
      const qty = 2 + i;
      const price = Number(variant.price);
      const subtotal = price * qty;
      const shipping = 15000;
      const grand = subtotal + shipping;

      const placedAt = new Date();
      placedAt.setDate(placedAt.getDate() - i);
      placedAt.setHours(10 + i, 30, 0, 0);

      const shippingAddress = JSON.stringify({
        name: buyer.name,
        phone: "081234567890",
        address: `Jl. Contoh No. ${i + 1}`,
        city: buyer.city,
        province: "DKI Jakarta",
        postal_code: "12345",
      });

      const [orderResult] = await pool.execute(
        `INSERT INTO orders (
          public_id, order_number, buyer_user_id, status, currency,
          subtotal, discount_total, shipping_total, tax_total, platform_fee,
          grand_total, shipping_address, placed_at, paid_at
        ) VALUES (?, ?, ?, ?, 'IDR', ?, 0, ?, 0, 0, ?, ?, ?, ?)`,
        [
          publicId, orderNumber, customer.id, status,
          subtotal, shipping, grand,
          shippingAddress,
          placedAt,
          status !== "pending_payment" ? placedAt : null,
        ]
      );

      const orderId = orderResult.insertId;

      await pool.execute(
        `INSERT INTO order_items (
          order_id, business_id, product_id, variant_id,
          product_name, variant_name, sku,
          quantity, unit_price, discount_amount, line_total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [
          orderId, variant.business_id, variant.product_id, variant.variant_id,
          variant.product_name, variant.variant_name, variant.sku,
          qty, price, subtotal,
        ]
      );

      console.log(`  ✓ ${orderNumber} - ${customer.full_name} → PT Sauri`);
    }

    console.log("\n=== Insert shipments ===");
    const [shippedOrders] = await pool.execute(
      `SELECT id FROM orders WHERE status IN ('shipped', 'completed')`
    );

    const COURIERS = [
      { courier: "JNE", service: "REG" },
      { courier: "J&T Express", service: "EZ" },
    ];

    let idx = 0;
    for (const order of shippedOrders) {
      const c = COURIERS[idx % COURIERS.length];
      await pool.execute(
        `INSERT INTO shipments (
          order_id, business_id, courier, service_name, tracking_number,
          status, shipping_cost, shipped_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          order.id, businessId, c.courier, c.service,
          `${c.courier.replace(/\s/g, "").toUpperCase()}${Date.now()}${order.id}`,
          "in_transit", 15000, new Date(),
        ]
      );
      console.log(`  ✓ Shipment order #${order.id} via ${c.courier}`);
      idx++;
    }

    console.log("\n=== Summary ===");
    const [summary] = await pool.execute(
      `SELECT o.order_number, o.status, u.full_name AS buyer, o.grand_total
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_user_id
       ORDER BY o.id ASC`
    );
    console.table(summary);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    console.error(err.sqlMessage || err);
    process.exit(1);
  }
})();
