"use strict";

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const apiRoot = path.resolve(__dirname, "..");
const csvPath = path.resolve(
  apiRoot,
  "..",
  "marketplace_web",
  "public",
  "data",
  "kbli_2025.csv"
);

function parseCsvLine(line, delimiter) {
  const out = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      out.push(value);
      value = "";
    } else {
      value += ch;
    }
  }

  out.push(value);
  return out;
}

function parseCsv(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const delimiter = [
    ",",
    ";",
    "\t"
  ].sort((a, b) =>
    parseCsvLine(firstLine, b).length -
    parseCsvLine(firstLine, a).length
  )[0];

  // CSV standard dapat memiliki newline di dalam quoted field.
  const records = [];
  let record = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (ch === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      record.push(value);
      value = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(value);
      if (record.some(v => v.trim() !== "")) records.push(record);
      record = [];
      value = "";
    } else {
      value += ch;
    }
  }

  if (value.length || record.length) {
    record.push(value);
    records.push(record);
  }

  if (!records.length) throw new Error("CSV kosong");

  const headers = records.shift().map(v => v.replace(/^\uFEFF/, "").trim());
  return records.map(row => {
    const obj = {};
    headers.forEach((header, i) => {
      obj[header] = (row[i] || "").trim();
    });
    return obj;
  });
}

function expectedParentLevel(level) {
  switch (level) {
    case "group_pokok": return null; // parent dapat berupa kategori huruf A–V
    case "group": return "group_pokok";
    case "subgroup": return "group";
    case "activity": return "subgroup";
    default: return "UNKNOWN";
  }
}

async function main() {
  if (!fs.existsSync(csvPath)) {
    throw new Error("CSV tidak ditemukan: " + csvPath);
  }

  const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));
  const required = ["code", "title", "level", "parent_code"];
  const missingHeaders = required.filter(
    h => !Object.keys(rows[0] || {}).includes(h)
  );

  if (missingHeaders.length) {
    throw new Error(
      "Header wajib tidak ditemukan: " + missingHeaders.join(", ") +
      ". Header aktual: " + Object.keys(rows[0] || {}).join(", ")
    );
  }

  const counts = {};
  const codes = new Map();
  const duplicateCodes = [];
  const emptyCodes = [];
  const invalidLevels = [];
  const missingParents = [];
  const wrongParentLevels = [];
  const parentlessActivities = [];

  for (const row of rows) {
    const code = row.code.trim();
    const level = row.level.trim();
    const parent = row.parent_code.trim();

    counts[level] = (counts[level] || 0) + 1;

    if (!code) {
      emptyCodes.push(row);
      continue;
    }

    if (codes.has(code)) {
      duplicateCodes.push({
        code,
        firstTitle: codes.get(code).title,
        duplicateTitle: row.title
      });
    } else {
      codes.set(code, row);
    }

    if (!["group_pokok", "group", "subgroup", "activity"].includes(level)) {
      invalidLevels.push({ code, level, title: row.title });
    }

    if (level === "activity" && !parent) {
      parentlessActivities.push({ code, title: row.title });
    }
  }

  for (const row of rows) {
    const code = row.code.trim();
    const level = row.level.trim();
    const parent = row.parent_code.trim();
    const expected = expectedParentLevel(level);

    if (level === "group_pokok") {
      // Parent kategori huruf A–V mungkin berada di luar daftar kode numerik.
      if (parent && !codes.has(parent) && !/^[A-V]$/.test(parent)) {
        missingParents.push({ code, level, parent_code: parent });
      }
      continue;
    }

    if (!parent) {
      if (level !== "activity") {
        missingParents.push({ code, level, parent_code: parent });
      }
      continue;
    }

    const parentRow = codes.get(parent);

    if (!parentRow) {
      missingParents.push({ code, level, parent_code: parent });
      continue;
    }

    if (expected !== "UNKNOWN" && parentRow.level !== expected) {
      wrongParentLevels.push({
        code,
        level,
        parent_code: parent,
        actualParentLevel: parentRow.level,
        expectedParentLevel: expected
      });
    }
  }

  console.log("\n=== AUDIT CSV KBLI 2025 ===");
  console.log("File:", csvPath);
  console.log("Total baris data:", rows.length);
  console.log("Total kode unik:", codes.size);
  console.log("Jumlah duplikasi kode:", duplicateCodes.length);
  console.log("Kode kosong:", emptyCodes.length);
  console.log("Level tidak dikenal:", invalidLevels.length);

  console.log("\n=== LEVEL ===");
  for (const level of ["activity", "subgroup", "group", "group_pokok"]) {
    console.log(`${level}: ${counts[level] || 0}`);
  }

  console.log("\n=== VALIDASI HIERARKI ===");
  console.log("Parent tidak ditemukan:", missingParents.length);
  console.log("Parent dengan level salah:", wrongParentLevels.length);
  console.log("Activity tanpa parent:", parentlessActivities.length);

  for (const [label, list] of [
    ["DUPLIKASI KODE", duplicateCodes],
    ["KODE KOSONG", emptyCodes],
    ["LEVEL TIDAK DIKENAL", invalidLevels],
    ["PARENT TIDAK DITEMUKAN", missingParents],
    ["LEVEL PARENT TIDAK SESUAI", wrongParentLevels],
    ["ACTIVITY TANPA PARENT", parentlessActivities]
  ]) {
    console.log(`\n=== ${label} (maksimal 20 contoh) ===`);
    console.table(list.slice(0, 20));
  }

  // Baca konfigurasi lokal tanpa menampilkan nilai credential.
  require("dotenv").config({ path: path.join(apiRoot, ".env"), quiet: true });

  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "nusadhipa_marketplace",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    connectionLimit: 2,
    connectTimeout: 5000,
    charset: "utf8mb4"
  });

  try {
    const [dbInfo] = await pool.query(
      "SELECT DATABASE() AS database_name, VERSION() AS database_version"
    );

    if (dbInfo[0].database_name !== "nusadhipa_marketplace") {
      throw new Error(
        "Database aktif bukan nusadhipa_marketplace; audit skema dihentikan."
      );
    }

    console.log("\n=== DATABASE ===");
    console.table(dbInfo);

    const [tables] = await pool.query(`
      SELECT TABLE_NAME, TABLE_TYPE, ENGINE
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME
    `);

    console.log("\n=== DAFTAR TABEL ===");
    console.table(tables);

    const [columns] = await pool.query(`
      SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE,
             IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, EXTRA
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `);

    console.log("\n=== KOLOM TABEL ===");
    console.table(columns);

    const [constraints] = await pool.query(`
      SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE CONSTRAINT_SCHEMA = DATABASE()
      ORDER BY TABLE_NAME, CONSTRAINT_TYPE, CONSTRAINT_NAME
    `);

    console.log("\n=== CONSTRAINT ===");
    console.table(constraints);

    const [foreignKeys] = await pool.query(`
      SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME,
             REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE CONSTRAINT_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME, CONSTRAINT_NAME, ORDINAL_POSITION
    `);

    console.log("\n=== FOREIGN KEY ===");
    console.table(foreignKeys);

    const targetNames = [
      "ref_kbli_codes",
      "business_kbli_codes",
      "catalog_categories",
      "catalog_category_kbli",
      "categories",
      "products",
      "product_variants",
      "inventory",
      "businesses",
      "kbli",
      "kbli_codes",
      "business_kbli"
    ];

    console.log("\n=== TABEL TERKAIT KBLI / KATALOG ===");
    console.table(
      tables.filter(t => targetNames.includes(t.TABLE_NAME))
    );

    console.log(
      "\nAudit selesai. Seluruh query database hanya membaca metadata."
    );
  } finally {
    await pool.end();
  }
}

main().catch(error => {
  console.error("\nAUDIT GAGAL:", error.message);
  process.exitCode = 1;
});
