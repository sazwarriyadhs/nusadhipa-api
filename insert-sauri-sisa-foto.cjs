require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");
const readline = require("readline/promises");

const DIR = "D:\\NUSA-DHIPA\\apps\\marketplace_web\\public\\sauri\\SAURI_29_Foto_Produk_Cropped";
const PREFIX = "/sauri/SAURI_29_Foto_Produk_Cropped/";

const mapping = [
  { file: "22_ikan-air-tawar.jpg", id: 29, expected: "Daging Ikan Tanpa Tulang" },
  { file: "24_fillet-ikan.jpg", id: 22, expected: "Fillet Tuna" },
  { file: "25_ikan-potong.jpg", id: 26, expected: "Potongan Ikan Beku" },
  { file: "26_pakan-kucing.jpg", id: 43, expected: "Pakan Kucing Kering" },
  { file: "27_pakan-anjing.jpg", id: 50, expected: "Pakan Anjing Kering" },
  { file: "29_pakan-ternak.jpg", id: 59, expected: "Tepung Ikan" },
];

async function main() {
  if (!fs.existsSync(DIR)) throw new Error("Folder foto tidak ditemukan: " + DIR);

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "nusadhipa_marketplace",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const plan = [];

    for (const item of mapping) {
      const fullPath = path.join(DIR, item.file);
      if (!fs.existsSync(fullPath)) {
        console.log(`[LEWATI] File tidak ditemukan: ${item.file}`);
        continue;
      }

      const [products] = await db.execute(
        "SELECT id, name FROM products WHERE id = ? AND business_id = 1",
        [item.id]
      );

      if (!products.length || products[0].name !== item.expected) {
        console.log(`[LEWATI] Produk tidak sesuai: ${item.id} / ${item.expected}`);
        continue;
      }

      const url = PREFIX + item.file;
      const [existing] = await db.execute(
        "SELECT id FROM product_images WHERE image_url = ? LIMIT 1",
        [url]
      );

      if (existing.length) {
        console.log(`[SUDAH ADA] ${item.file}`);
        continue;
      }

      plan.push({ ...item, url, productName: products[0].name });
    }

    console.log("\n=== KONFIRMASI INSERT ===");
    for (const item of plan) {
      console.log(`${item.file} -> [${item.id}] ${item.productName}`);
    }
    console.log(`Total siap insert: ${plan.length}`);

    if (!plan.length) {
      console.log("Tidak ada foto baru yang siap diinsert.");
      return;
    }

    const confirm = await rl.question(
      '\nKetik INSERT untuk melanjutkan, atau selain itu untuk membatalkan: '
    );

    if (confirm.trim() !== "INSERT") {
      console.log("Dibatalkan. Database tidak diubah.");
      return;
    }

    await db.beginTransaction();
    let count = 0;

    for (const item of plan) {
      const [primary] = await db.execute(
        "SELECT id FROM product_images WHERE product_id = ? AND is_primary = 1 LIMIT 1",
        [item.id]
      );

      await db.execute(
        `INSERT INTO product_images
          (product_id, image_url, alt_text, sort_order, is_primary, created_at)
         VALUES (?, ?, ?, 1, ?, NOW())`,
        [item.id, item.url, item.productName, primary.length ? 0 : 1]
      );

      console.log(`[INSERT] ${item.productName} <- ${item.url}`);
      count++;
    }

    await db.commit();
    console.log(`\nSelesai. ${count} foto baru berhasil diinsert.`);
  } catch (error) {
    try { await db.rollback(); } catch {}
    console.error("Gagal; transaksi dibatalkan jika masih terbuka:", error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await db.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
