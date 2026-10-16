const fs = require("fs");
const path = require("path");

const file = path.resolve("src/routes/cart.js");
let s = fs.readFileSync(file, "utf8");

function replaceExact(oldText, newText, label, expected = 1) {
  const count = s.split(oldText).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: ditemukan ${count}, seharusnya ${expected}. File asli belum ditulis.`);
  }
  s = s.split(oldText).join(newText);
}

function replaceBetween(start, end, replacement, label) {
  const a = s.indexOf(start);
  const b = s.indexOf(end, a + start.length);
  if (a < 0 || b < 0 || b <= a) {
    throw new Error(`${label}: batas fungsi tidak ditemukan. File asli belum ditulis.`);
  }
  s = s.slice(0, a) + replacement + "\n\n" + s.slice(b);
}

replaceBetween(
  "function resolvePolicy(",
  "// ============ Helper: normalisasi quantity ============",
`function resolvePolicy(variant, customerType, requestedQty) {
  if (!["package", "weight"].includes(variant.sales_mode)) {
    return { mode: "unclassified", available: false, reason: "Varian belum diklasifikasikan.", minQty: 0, step: 0, price: 0, unit: variant.selling_unit || "unit" };
  }

  if (variant.sales_mode === "package") {
    if (variant.selling_unit === "kg") {
      return { mode: "invalid", available: false, reason: "Satuan varian kemasan tidak valid.", minQty: 0, step: 0, price: 0, unit: "kg" };
    }
    const price = Number(variant.retail_price ?? variant.price);
    return {
      mode: "package",
      available: Number.isFinite(price) && price > 0,
      reason: Number.isFinite(price) && price > 0 ? null : "Harga kemasan belum ditetapkan.",
      minQty: 1, step: 1, price, unit: "unit"
    };
  }

  if (variant.selling_unit !== "kg") {
    return { mode: "invalid", available: false, reason: "Satuan varian timbang tidak valid.", minQty: 0, step: 0, price: 0, unit: variant.selling_unit || "unit" };
  }

  const minRetail = Number(variant.min_retail_kg ?? 0.5);
  const minB2B = Number(variant.min_b2b_kg ?? 50);
  const stepRetail = Number(variant.retail_step_kg ?? 0.5);
  const stepB2B = Number(variant.b2b_step_kg ?? 1);
  const priceRetail = Number(variant.retail_price ?? variant.price);
  const priceB2B = variant.b2b_price == null ? null : Number(variant.b2b_price);
  const useB2B = customerType === "b2b" ||
    (customerType === "retail" && Number(requestedQty) >= minB2B);

  if (useB2B) {
    const validPrice = priceB2B !== null && Number.isFinite(priceB2B) && priceB2B > 0;
    return {
      mode: "b2b", available: validPrice,
      reason: validPrice ? null : "Harga B2B belum ditetapkan.",
      minQty: minB2B, step: stepB2B, price: validPrice ? priceB2B : 0, unit: "kg"
    };
  }

  const validPrice = Number.isFinite(priceRetail) && priceRetail > 0;
  return {
    mode: "retail", available: validPrice,
    reason: validPrice ? null : "Harga retail belum ditetapkan.",
    minQty: minRetail, step: stepRetail, price: validPrice ? priceRetail : 0, unit: "kg"
  };
}`,
  "resolvePolicy"
);

replaceBetween(
  "function normalizeQty(",
  "// ============ Helper: cart aktif ============",
`function validateQty(rawQty, policy) {
  if (!policy.available) return policy.reason || "Varian tidak tersedia untuk dibeli.";
  if (rawQty === undefined || rawQty === null || rawQty === "" || typeof rawQty === "boolean") {
    return "Quantity wajib berupa angka positif.";
  }

  const qty = Number(rawQty);
  if (!Number.isFinite(qty) || qty <= 0) return "Quantity wajib berupa angka positif.";
  if (qty < policy.minQty) return "Minimum pembelian " + policy.minQty + " " + policy.unit + ".";
  if (Math.abs(qty / policy.step - Math.round(qty / policy.step)) > 1e-8) {
    return "Quantity harus mengikuti kelipatan " + policy.step + " " + policy.unit + ".";
  }
  if (policy.unit !== "kg" && !Number.isInteger(qty)) return "Jumlah kemasan harus bilangan bulat.";
  return null;
}`,
  "validasi quantity"
);

replaceExact(
  "pv.selling_unit, pv.quantity_step, pv.weight_grams,",
  "pv.sales_mode, pv.selling_unit, pv.quantity_step, pv.weight_grams,",
  "kolom sales_mode GET"
);

replaceExact(
  "SELECT id, product_id, selling_unit, quantity_step, price,",
  "SELECT id, product_id, sales_mode, selling_unit, quantity_step, price,",
  "kolom sales_mode POST"
);

replaceExact(
  "SELECT ci.id, pv.selling_unit, pv.quantity_step, pv.price,",
  "SELECT ci.id, pv.sales_mode, pv.selling_unit, pv.quantity_step, pv.price,",
  "kolom sales_mode PATCH"
);

replaceExact(
  "const policy = resolvePolicy(variant, customerType, Number(quantity));\n      const qty = normalizeQty(quantity, policy);",
  "const policy = resolvePolicy(variant, customerType, quantity);\n      const qtyError = validateQty(quantity, policy);\n      if (qtyError) return res.status(400).json({ success: false, message: qtyError });\n      const qty = Number(quantity);",
  "validasi quantity POST"
);

replaceExact(
  "const policy = resolvePolicy(rows[0], customerType, Number(quantity));\n      const qty = normalizeQty(quantity, policy);",
  "const policy = resolvePolicy(rows[0], customerType, quantity);\n      const qtyError = validateQty(quantity, policy);\n      if (qtyError) return res.status(400).json({ success: false, message: qtyError });\n      const qty = Number(quantity);",
  "validasi quantity PATCH"
);

replaceExact(
  "          mode: policy.mode,\n          weight_grams:",
  "          mode: policy.mode,\n          can_purchase: Boolean(policy.available),\n          availability_reason: policy.reason || null,\n          weight_grams:",
  "status pembelian GET"
);

const backupDir = path.resolve("D:/NUSA-DHIPA/backups");
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(backupDir, "cart-before-validation-" + stamp + ".js");

fs.copyFileSync(file, backup);
fs.writeFileSync(file, s, "utf8");
console.log("PATCH OK");
console.log("Backup:", backup);
