const pool = require("./src/db");

(async () => {
  try {
    const [cols] = await pool.execute("DESCRIBE businesses");
    const existing = cols.map(c => c.Field);
    console.log("Kolom existing:");
    console.log(existing.join(", "));

    const toAdd = [];
    if (!existing.includes("legal_name"))
      toAdd.push("ADD COLUMN legal_name VARCHAR(255) NULL AFTER business_name");
    if (!existing.includes("kbli_code"))
      toAdd.push("ADD COLUMN kbli_code VARCHAR(10) NULL AFTER tax_number");
    if (!existing.includes("kbli_name"))
      toAdd.push("ADD COLUMN kbli_name VARCHAR(255) NULL AFTER kbli_code");

    if (toAdd.length === 0) {
      console.log("\n✅ Semua kolom sudah ada");
      process.exit(0);
    }

    const sql = `ALTER TABLE businesses ${toAdd.join(", ")}`;
    console.log("\nRunning:", sql, "\n");
    await pool.execute(sql);
    console.log("✅ Kolom berhasil ditambahkan!");

    // Verifikasi
    const [newCols] = await pool.execute("DESCRIBE businesses");
    console.log("\n=== Kolom baru ===");
    console.table(
      newCols.filter(c => 
        ["legal_name", "kbli_code", "kbli_name"].includes(c.Field)
      ).map(c => ({ Field: c.Field, Type: c.Type }))
    );

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
})();
