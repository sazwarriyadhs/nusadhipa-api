require("dotenv").config();
const mysql = require("mysql2/promise");

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || "nusadhipa_marketplace",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
  });

  try {
    const [rows] = await db.execute(`
      SELECT pi.image_url, pi.product_id, p.name AS product_name,
             p.business_id, pi.is_primary
      FROM product_images pi
      JOIN products p ON p.id = pi.product_id
      WHERE pi.image_url LIKE ?
      ORDER BY pi.image_url
    `, ["/sauri/SAURI_29_Foto_Produk_Cropped/%"]);

    console.table(rows);
    console.log("Total foto dalam folder yang tercatat:", rows.length);
  } catch (e) {
    console.error("Verifikasi gagal:", e.message);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
})();
