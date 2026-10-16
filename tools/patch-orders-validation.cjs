const fs = require("fs");
const path = require("path");

const file = path.resolve("src/routes/orders.js");
let s = fs.readFileSync(file, "utf8");

function replaceOnce(oldText, newText, label) {
  const count = s.split(oldText).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: ditemukan ${count} kecocokan, file asli tidak ditulis.`);
  }
  s = s.replace(oldText, newText);
}

replaceOnce(
  "pv.id, pv.product_id, pv.variant_name, pv.sku, pv.price,\n        pv.selling_unit, pv.quantity_step, pv.weight_grams,",
  "pv.id, pv.product_id, pv.variant_name, pv.sku, pv.price,\n        pv.sales_mode, pv.selling_unit, pv.quantity_step, pv.weight_grams,",
  "SELECT sales_mode"
);

replaceOnce(
`      const isKg = variant.selling_unit === "kg";
      let minQty, step, price, unit;

      if (isKg) {
        const minRetail = Number(variant.min_retail_kg || 0.5);
        const minB2B = Number(variant.min_b2b_kg || 50);
        const stepRetail = Number(variant.retail_step_kg || 0.5);
        const stepB2B = Number(variant.b2b_step_kg || 1);
        const priceRetail = Number(variant.retail_price || variant.price);
        const priceB2B = Number(variant.b2b_price || variant.price);

        const useB2B =
          customerType === "b2b" ||
          (customerType === "retail" && Number(item.quantity) >= minB2B);

        if (useB2B) {
          minQty = minB2B;
          step = stepB2B;
          price = priceB2B;
        } else {
          minQty = minRetail;
          step = stepRetail;
          price = priceRetail;
        }
        unit = "kg";
      } else {
        minQty = 1;
        step = 1;
        price = Number(variant.retail_price || variant.price);
        unit = "unit";
      }

      // Normalisasi
      let qty = Math.round((Number(item.quantity) || minQty) / step) * step;
      if (qty < minQty) qty = minQty;
      if (unit === "kg") qty = Math.round(qty * 1000) / 1000;`,
`      if (!["package", "weight"].includes(variant.sales_mode)) {
        return res.status(400).json({
          success: false,
          message: \`Varian "\${variant.product_name}" belum diklasifikasikan untuk penjualan.\`,
        });
      }

      const isPackage = variant.sales_mode === "package";
      const isKg = variant.selling_unit === "kg";
      if ((isPackage && isKg) || (!isPackage && !isKg)) {
        return res.status(400).json({
          success: false,
          message: \`Konfigurasi satuan varian "\${variant.product_name}" tidak valid.\`,
        });
      }

      let minQty, step, price, unit;

      if (isPackage) {
        minQty = 1;
        step = 1;
        price = Number(variant.retail_price ?? variant.price);
        unit = "unit";
      } else {
        const minRetail = Number(variant.min_retail_kg ?? 0.5);
        const minB2B = Number(variant.min_b2b_kg ?? 50);
        const stepRetail = Number(variant.retail_step_kg ?? 0.5);
        const stepB2B = Number(variant.b2b_step_kg ?? 1);
        const priceRetail = Number(variant.retail_price ?? variant.price);
        const priceB2B = variant.b2b_price == null ? null : Number(variant.b2b_price);
        const requestedQty = item.quantity;
        const useB2B = customerType === "b2b" ||
          (customerType === "retail" && Number(requestedQty) >= minB2B);

        if (useB2B) {
          minQty = minB2B;
          step = stepB2B;
          price = priceB2B;
          if (price === null || !Number.isFinite(price) || price <= 0) {
            return res.status(400).json({
              success: false,
              message: \`Harga B2B "\${variant.product_name}" belum ditetapkan.\`,
            });
          }
        } else {
          minQty = minRetail;
          step = stepRetail;
          price = priceRetail;
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
          message: \`Minimum pembelian "\${variant.product_name}" adalah \${minQty} \${unit}.\`,
        });
      }
      if (Math.abs(qty / step - Math.round(qty / step)) > 1e-8 ||
          (unit !== "kg" && !Number.isInteger(qty))) {
        return res.status(400).json({
          success: false,
          message: \`Quantity "\${variant.product_name}" harus mengikuti kelipatan \${step} \${unit}.\`,
        });
      }
      if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({
          success: false,
          message: \`Harga "\${variant.product_name}" belum ditetapkan.\`,
        });
      }`,
  "validasi checkout"
);

const backupDir = path.resolve("D:/NUSA-DHIPA/backups");
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(backupDir, "orders-before-validation-" + stamp + ".js");
fs.copyFileSync(file, backup);
fs.writeFileSync(file, s, "utf8");

console.log("PATCH OK");
console.log("Backup:", backup);
