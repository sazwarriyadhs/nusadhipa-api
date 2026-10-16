const fs = require("fs");
const path = require("path");

const file = path.resolve("src/routes/orders.js");
let source = fs.readFileSync(file, "utf8");

const anchor = `      await conn.beginTransaction();

      const [orderResult] = await conn.execute(`;

const replacement = `      await conn.beginTransaction();

      // Kunci stok di dalam transaksi agar checkout bersamaan tidak oversell.
      const lockIds = [...new Set(variantIds)].sort((a, b) => a - b);
      const lockPlaceholders = lockIds.map(() => "?").join(",");
      const [lockedInventory] = await conn.execute(
        \`SELECT variant_id, quantity_on_hand, quantity_reserved
         FROM inventory
         WHERE variant_id IN (\${lockPlaceholders})
         ORDER BY variant_id
         FOR UPDATE\`,
        lockIds
      );

      const inventoryByVariant = new Map(
        lockedInventory.map((row) => [
          Number(row.variant_id),
          Number(row.quantity_on_hand) - Number(row.quantity_reserved),
        ])
      );

      for (const item of orderItems) {
        const available = inventoryByVariant.get(Number(item.variant_id));
        if (available === undefined || !Number.isFinite(available) ||
            available < 0 || Number(item.quantity) > available) {
          await conn.rollback();
          conn.release();
          return res.status(400).json({
            success: false,
            message: available === undefined
              ? \`Data stok varian \${item.variant_id} belum tersedia.\`
              : \`Stok varian \${item.variant_id} tidak cukup. Tersedia: \${available}.\`,
          });
        }
      }

      const [orderResult] = await conn.execute(`;

if (source.split(anchor).length !== 2) {
  throw new Error("Anchor checkout tidak cocok tepat satu kali. File tidak diubah.");
}

const backupDir = "D:/NUSA-DHIPA/backups";
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/:/g, "-");
const backup = path.join(backupDir, `orders-before-stock-lock-${stamp}.js`);

fs.copyFileSync(file, backup);
source = source.replace(anchor, replacement);
fs.writeFileSync(file, source, "utf8");

console.log("PATCH OK");
console.log("Backup:", backup);
