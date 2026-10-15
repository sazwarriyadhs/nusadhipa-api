const pool = require("./src/db");

(async () => {
  try {
    // Update data lengkap dari AHU + NIB
    await pool.execute(
      `UPDATE businesses SET 
        legal_name = ?,
        kbli_code = ?,
        kbli_name = ?,
        nib = ?,
        tax_number = ?,
        province = ?,
        city = ?,
        address = ?,
        phone = ?,
        email = ?,
        verification_status = ?
       WHERE id = 1`,
      [
        "PT SAURI UNGGUL SEJAHTERA",
        "46322",
        "Perdagangan Besar Daging Ayam dan Daging Ayam Olahan",
        "0809230108335",
        "0398313270404000",
        "Jawa Barat",
        "Kota Bogor",
        "Jl. Ciheuleut, Baranangsiang, Kec. Bogor Timur, Kota Bogor, Jawa Barat 16143",
        "08999986899",
        "sauriunggulsejahtera@gmail.com",
        "verified",
      ]
    );
    console.log("✅ Data legal AHU + NIB diupdate");

    const [rows] = await pool.execute(
      `SELECT legal_name, nib, tax_number, kbli_code, kbli_name, 
              province, city, verification_status 
       FROM businesses WHERE id = 1`
    );
    console.log("\n=== Data Final ===");
    console.table(rows);

    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    process.exit(1);
  }
})();
