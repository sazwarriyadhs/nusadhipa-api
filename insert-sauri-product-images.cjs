require("dotenv").config();

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
const readline = require("readline/promises");

const IMAGE_DIR = path.resolve(
  "..\..\apps\marketplace_web\public\sauri\SAURI_29_Foto_Produk_Cropped"
);

// Path.resolve di atas relatif terhadap folder API.
// Validasi juga lokasi yang dimaksud secara eksplisit.
const SOURCE_DIR =
  "D:\\NUSA-DHIPA\\apps\\marketplace_web\\public\\sauri\\SAURI_29_Foto_Produk_Cropped";

const BUSINESS_ID = 1;
const PUBLIC_PREFIX = "/sauri/SAURI_29_Foto_Produk_Cropped/";

const aliases = {
  "21_tuna-mixed-cooked-saurigo-tmc-001.jpg": [
    "tuna mixed cooked",
    "saurigo tmc 001",
    "tmc 001"
  ],
};

function norm(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\.(jpg|jpeg|png|webp)$/i, "")
    .replace(/^\d+[_\s-]*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function getCandidates(filename, products) {
  const target = norm(filename);
  const specialAliases = (aliases[filename] || []).map(norm);
  const targets = [target, ...specialAliases];

  return products.filter((product) => {
    const name = norm(product.name);

    return targets.some((phrase) =>
      name === phrase ||
      name.startsWith(phrase + " ") ||
      name.includes(" " + phrase + " ")
    );
  });
}

async function main() {
  if (!fs.existsSync(SOURCE_DIR)) {
    throw new Error("Folder foto tidak ditemukan: " + SOURCE_DIR);
  }

  const files = fs.readdirSync(SOURCE_DIR)
    .filter((name) => /\.(jpg|jpeg|png|webp)$/i.test(name))
    .sort();

  if (files.length !== 29) {
    console.log(`PERINGATAN: ditemukan ${files.length} file gambar, bukan 29.`);
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "nusadhipa_marketplace",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const [products] = await db.execute(
      `SELECT id, name, business_id
       FROM products
       WHERE business_id = ?
       ORDER BY id`,
      [BUSINESS_ID]
    );

    const [existingImages] = await db.execute(
      `SELECT product_id, image_url
       FROM product_images`
    );

    const plan = files.map((filename) => {
      const matches = getCandidates(filename, products);
      const imageUrl = PUBLIC_PREFIX + filename;

      return {
        filename,
        imageUrl,
        matches,
        alreadyExists: existingImages.some(
          (image) => image.image_url === imageUrl
        ),
      };
    });

    console.log("\n=== RENCANA PEMASANGAN FOTO SAURI ===");
    console.log("Database       :", process.env.DB_NAME || "nusadhipa_marketplace");
    console.log("Business ID    :", BUSINESS_ID);
    console.log("Folder sumber  :", SOURCE_DIR);
    console.log("Produk bisnis  :", products.length);
    console.log("Jumlah foto    :", files.length);
    console.log("");

    for (const item of plan) {
      if (item.matches.length === 1) {
        console.log(
          `[COCOK] ${item.filename} -> ${item.matches[0].name}` +
          (item.alreadyExists ? " [URL SUDAH ADA]" : "")
        );
      } else if (item.matches.length > 1) {
        console.log(
          `[AMBIGU] ${item.filename} -> ` +
          item.matches.map((p) => `${p.id}:${p.name}`).join(" | ")
        );
      } else {
        console.log(`[BELUM COCOK] ${item.filename}`);
      }
    }

    const ready = plan.filter(
      (item) => item.matches.length === 1 && !item.alreadyExists
    );

    const skipped = plan.length - ready.length;

    console.log("\nSiap insert :", ready.length);
    console.log("Dilewati    :", skipped);

    if (ready.length === 0) {
      console.log("\nTidak ada foto baru yang aman untuk diinsert.");
      console.log("Periksa nama produk untuk item BELUM COCOK atau AMBIGU.");
      return;
    }

    const answer = await rl.question(
      '\nKetik INSERT untuk menyimpan foto yang cocok saja: '
    );

    if (answer.trim() !== "INSERT") {
      console.log("Dibatalkan. Database tidak diubah.");
      return;
    }

    await db.beginTransaction();

    let inserted = 0;

    for (const item of ready) {
      const product = item.matches[0];

      // Pastikan file gambar benar-benar tersedia sebelum menyimpan URL.
      if (!fs.existsSync(path.join(SOURCE_DIR, item.filename))) {
        console.log(`[LEWATI] File hilang: ${item.filename}`);
        continue;
      }

      // Cegah duplikasi URL jika ada perubahan sejak audit.
      const [duplicate] = await db.execute(
        `SELECT id FROM product_images WHERE image_url = ? LIMIT 1`,
        [item.imageUrl]
      );

      if (duplicate.length) {
        console.log(`[LEWATI] URL sudah ada: ${item.filename}`);
        continue;
      }

      const [primaryRows] = await db.execute(
        `SELECT id FROM product_images
         WHERE product_id = ? AND is_primary = 1
         LIMIT 1`,
        [product.id]
      );

      await db.execute(
        `INSERT INTO product_images
          (product_id, image_url, alt_text, sort_order, is_primary, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [
          product.id,
          item.imageUrl,
          product.name,
          1,
          primaryRows.length === 0 ? 1 : 0
        ]
      );

      inserted++;
      console.log(`[INSERT] ${product.name} <- ${item.imageUrl}`);
    }

    await db.commit();

    console.log("\n=== SELESAI ===");
    console.log("Foto berhasil diinsert:", inserted);
    console.log("Foto yang belum cocok atau ambigu tidak dipaksakan.");
  } catch (error) {
    try {
      await db.rollback();
    } catch {}

    console.error("\nGAGAL. Transaksi dibatalkan jika masih terbuka.");
    console.error(error.message);
  } finally {
    rl.close();
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
