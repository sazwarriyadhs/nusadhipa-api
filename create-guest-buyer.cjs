const pool = require("./src/db");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

(async () => {
  try {
    const email = "guest.buyer@nusadhipa.shop";
    const [dup] = await pool.execute("SELECT id FROM users WHERE email = ?", [email]);
    
    if (dup.length > 0) {
      console.log(`ℹ️ Guest buyer sudah ada: id=${dup[0].id}`);
      process.exit(0);
    }

    const hash = await bcrypt.hash("guest123", 10);
    const publicId = crypto.randomUUID();
    
    const [res] = await pool.execute(
      `INSERT INTO users (public_id, full_name, email, password_hash, status)
       VALUES (?, ?, ?, ?, 'active')`,
      [publicId, "Guest Buyer", email, hash]
    );
    
    console.log(`✅ Guest buyer created: id=${res.insertId}`);
    console.log(`   Email: ${email}`);
    console.log(`   Password: guest123`);
    
    process.exit(0);
  } catch (err) {
    console.error("❌", err.message);
    process.exit(1);
  }
})();
