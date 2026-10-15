const pool = require("./src/db");

(async () => {
  try {
    await pool.execute(`
      CREATE TABLE IF NOT EXISTS business_kbli (
        id BIGINT(20) UNSIGNED NOT NULL AUTO_INCREMENT,
        business_id BIGINT(20) UNSIGNED NOT NULL,
        kbli_code VARCHAR(10) NOT NULL,
        kbli_name VARCHAR(255) NOT NULL,
        is_primary TINYINT(1) NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        KEY idx_business (business_id),
        KEY idx_code (kbli_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log("✅ Tabel business_kbli siap");

    const [existing] = await pool.execute(
      "SELECT COUNT(*) n FROM business_kbli WHERE business_id = 1"
    );
    
    if (existing[0].n > 0) {
      console.log(`ℹ️ Sudah ada ${existing[0].n} KBLI, skip insert`);
    } else {
      const kbliList = [
        ["46322", "Perdagangan Besar Daging Ayam dan Daging Ayam Olahan", 1],
        ["46325", "Perdagangan Besar Hasil Perikanan dan Olahan Terkait", 0],
        ["46205", "Perdagangan Besar Makanan Hewan Kesayangan (Pet Food)", 0],
        ["46900", "Perdagangan Besar Berbagai Macam Barang", 0],
        ["47722", "Perdagangan Eceran Kosmetik dan Barang Farmasi", 0],
        ["47911", "Perdagangan Eceran Melalui Media", 0],
      ];

      for (const [code, name, isPrimary] of kbliList) {
        await pool.execute(
          `INSERT INTO business_kbli (business_id, kbli_code, kbli_name, is_primary)
           VALUES (1, ?, ?, ?)`,
          [code, name, isPrimary]
        );
      }
      console.log(`✅ ${kbliList.length} KBLI diinsert`);
    }

    const [rows] = await pool.execute(
      "SELECT kbli_code, kbli_name, is_primary FROM business_kbli WHERE business_id = 1"
    );
    console.table(rows);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    process.exit(1);
  }
})();
