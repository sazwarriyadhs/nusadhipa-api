const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const pool = require("../src/db");

const EMAIL = "ptsauriunggulsejahtera@gmail.com";
const OWNER = "Sopian Sauri";
const BUSINESS = "FRESH MARKET UNGGAS & ANIMAL PETFOOD INDONESIA";
const BUSINESS_SLUG = "fresh-market-unggas-animal-petfood-indonesia";
const SECRET_FILE = path.resolve(__dirname, "../.jwt-secret.local");

const products = [
  ...[
    "Boneless Dada", "Boneless Paha", "Paha Pentung", "Sayap R",
    "Sayap BN", "Kepala BN", "Kepala PT", "Ceker BN", "Ceker Kuning",
    "Kulit Body", "Krokong PT", "Jantung Bersih", "Ampela Bersih",
    "Ampela Kotor", "Hati Bersih", "Usus", "Tulang Paha", "Tunggir",
    "Ayam Utuh Karkas"
  ].map(name => ({ name, category: "daging-unggas", brand: "SAURI FRESH" })),

  ...[
    "Tuna Loin", "Tuna Steak", "Fillet Tuna", "Fillet Tenggiri",
    "Fillet Kakap", "Fillet Dori", "Potongan Ikan Beku", "Ikan Laut Beku",
    "Tuna Giling", "Daging Ikan Tanpa Tulang", "Ikan Cincang", "Surimi",
    "Bakso Ikan", "Nugget Ikan", "Otak-otak Ikan", "Pempek Beku",
    "Ikan Asin", "Ikan Asap", "Ikan Pindang", "Ikan Presto",
    "Ikan Marinasi", "Seafood Siap Masak"
  ].map(name => ({ name, category: "ikan-seafood", brand: "SAURI FRESH" })),

  {
    name: "SAURIGO TMC-001 Tuna Mixed Cooked",
    category: "ikan-seafood",
    brand: "SAURIGO",
    description: "Formula referensi: tuna 60%, ayam cincang 10%, minyak tuna 10%, trimming tuna bertulang 20%. Status draft; spesifikasi produksi dan label wajib diverifikasi sebelum publikasi."
  },

  ...[
    ["Pakan Kucing Kering", "pakan-kucing"],
    ["Pakan Kucing Basah", "pakan-kucing"],
    ["Pakan Kitten", "pakan-kucing"],
    ["Pakan Kucing Dewasa", "pakan-kucing"],
    ["Pakan Kucing Steril", "pakan-kucing"],
    ["Snack Kucing", "pakan-kucing"],
    ["Pakan Kucing Berbahan Ikan", "pakan-kucing"],

    ["Pakan Anjing Kering", "pakan-anjing"],
    ["Pakan Anjing Basah", "pakan-anjing"],
    ["Pakan Puppy", "pakan-anjing"],
    ["Pakan Anjing Dewasa", "pakan-anjing"],
    ["Snack Anjing", "pakan-anjing"],

    ["Pelet Ikan Apung", "pakan-ikan"],
    ["Pelet Ikan Tenggelam", "pakan-ikan"],
    ["Pakan Benih Ikan", "pakan-ikan"],
    ["Pakan Ikan Hias", "pakan-ikan"],

    ["Tepung Ikan", "pakan-ternak"],
    ["Minyak Ikan", "pakan-ternak"],
    ["Tepung Kepala dan Tulang Ikan", "pakan-ternak"],
    ["Bahan Baku Protein Hewani untuk Petfood", "pakan-ternak"]
  ].map(([name, category]) => ({
    name, category, brand: "SAURI PAWS"
  }))
];

function slugify(value) {
  return value.toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function promptHidden(question) {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    if (!stdin.isTTY || !stdout.isTTY) {
      return reject(new Error("Jalankan seed langsung dari terminal PowerShell interaktif."));
    }

    stdout.write(question);
    let value = "";
    stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
    }

    function onData(char) {
      if (char === "\u0003") {
        cleanup();
        reject(new Error("Dibatalkan."));
      } else if (char === "\r" || char === "\n") {
        cleanup();
        resolve(value);
      } else if (char === "\u007f" || char === "\b") {
        value = value.slice(0, -1);
      } else if (char >= " ") {
        value += char;
      }
    }
    stdin.on("data", onData);
  });
}

async function main() {
  if (products.length !== 62) {
    throw new Error(`Jumlah katalog tidak sesuai: ${products.length}; bootstrap dibatalkan.`);
  }

  const password = await promptHidden("Password baru akun Sopian Sauri (min. 12 karakter, input tersembunyi): ");
  if (password.length < 12) throw new Error("Password minimal 12 karakter.");
  const confirmation = await promptHidden("Ulangi password: ");
  if (password !== confirmation) throw new Error("Konfirmasi password tidak cocok.");

  if (!fs.existsSync(SECRET_FILE) || fs.readFileSync(SECRET_FILE, "utf8").trim().length < 32) {
    throw new Error("Secret JWT tidak tersedia/valid. Jalankan patch PowerShell terlebih dahulu.");
  }

  const conn = await pool.getConnection();
  let committed = false;

  try {
    await conn.beginTransaction();

    const [existing] = await conn.execute(
      `SELECT email FROM users WHERE email = ?
       UNION SELECT email FROM businesses WHERE slug = ? AND email IS NOT NULL`,
      [EMAIL, BUSINESS_SLUG]
    );
    const [businessExisting] = await conn.execute(
      "SELECT id FROM businesses WHERE slug = ? LIMIT 1",
      [BUSINESS_SLUG]
    );

    if (existing.length || businessExisting.length) {
      throw new Error("Email pemilik atau slug tenant sudah ada. Tidak ada data baru yang ditambahkan.");
    }

    const [categoryRows] = await conn.execute(
      "SELECT id, slug FROM categories WHERE slug IN (?, ?, ?, ?, ?)",
      ["daging-unggas", "ikan-seafood", "pakan-ternak", "pakan-kucing", "pakan-anjing"]
    );
    const categories = new Map(categoryRows.map(row => [row.slug, row.id]));
    const required = ["daging-unggas", "ikan-seafood", "pakan-ternak", "pakan-kucing", "pakan-anjing", "pakan-ikan"];
    const [fishFeedRows] = await conn.execute(
      "SELECT id, slug FROM categories WHERE slug = ? LIMIT 1",
      ["pakan-ikan"]
    );
    for (const row of fishFeedRows) categories.set(row.slug, row.id);

    const missing = required.filter(slug => !categories.has(slug));
    if (missing.length) throw new Error("Kategori belum tersedia: " + missing.join(", "));

    const passwordHash = await bcrypt.hash(password, 12);
    const userPublicId = crypto.randomUUID();

    const [userResult] = await conn.execute(
      `INSERT INTO users
       (public_id, full_name, email, password_hash, status, email_verified_at)
       VALUES (?, ?, ?, ?, 'active', NULL)`,
      [userPublicId, OWNER, EMAIL, passwordHash]
    );

    const businessPublicId = crypto.randomUUID();
    const [businessResult] = await conn.execute(
      `INSERT INTO businesses
       (public_id, owner_user_id, business_name, slug, business_type,
        description, email, verification_status, status)
       VALUES (?, ?, ?, ?, 'supplier', ?, ?, 'unverified', 'draft')`,
      [
        businessPublicId,
        userResult.insertId,
        BUSINESS,
        BUSINESS_SLUG,
        "Entitas usaha: PT Sauri Unggul Sejahtera. Katalog awal berstatus draft; harga, stok, kemasan, dan kelengkapan legal menunggu verifikasi.",
        EMAIL
      ]
    );

    for (const product of products) {
      const slug = "sauri-" + slugify(product.name);
      const categoryId = categories.get(product.category);
      const description = product.description ||
        "Katalog awal PT Sauri Unggul Sejahtera. Detail kemasan, harga, stok, dan spesifikasi belum dikonfirmasi; produk belum dipublikasikan.";

      await conn.execute(
        `INSERT INTO products
         (public_id, business_id, category_id, name, slug, sku,
          short_description, description, brand, product_type,
          condition_type, status, weight_grams, requires_shipping, published_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'physical', 'new', 'draft', 0, 1, NULL)`,
        [
          crypto.randomUUID(),
          businessResult.insertId,
          categoryId,
          product.name,
          slug,
          "Katalog draft — menunggu konfirmasi detail produk.",
          description,
          product.brand
        ]
      );
    }

    await conn.commit();
    committed = true;

    console.log("\nBOOTSTRAP BERHASIL");
    console.log("Pemilik       :", OWNER);
    console.log("Email         :", EMAIL);
    console.log("Tenant        :", BUSINESS);
    console.log("Business ID   :", businessResult.insertId);
    console.log("Produk draft  :", products.length);
    console.log("Status tenant : draft");
    console.log("Status produk : draft");
    console.log("Email verified: belum (NULL)");
    console.log("Harga/stok    : belum dibuat");
    console.log("Password      : tidak ditampilkan");
  } catch (error) {
    if (!committed) await conn.rollback();
    throw error;
  } finally {
    conn.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error("\nBOOTSTRAP GAGAL:", error.message);
  process.exitCode = 1;
});