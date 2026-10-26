
const jwt = require("jsonwebtoken");
const db = require("../db");

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

module.exports = async function requireCourierAuth(req, res, next) {
  const authorization = req.headers.authorization || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return res.status(401).json({
      success: false,
      message: "Token autentikasi kurir diperlukan.",
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret || secret.trim().length < 32) {
    return res.status(503).json({
      success: false,
      message: "Autentikasi kurir belum dikonfigurasi dengan benar.",
    });
  }

  try {
    const claims = jwt.verify(match[1], secret.trim(), {
      algorithms: ["HS256"],
    });

    const courierId = parseId(claims.id);

    if (
      claims.role !== "courier" ||
      !courierId ||
      typeof claims.public_id !== "string" ||
      !claims.public_id.trim()
    ) {
      return res.status(401).json({
        success: false,
        message: "Token kurir tidak valid.",
      });
    }

    const [rows] = await db.execute(
      `SELECT
         id, public_id, name, email, phone,
         vehicle_type, plate_number, city,
         payout_method, payout_account, status
       FROM couriers
       WHERE id = ? AND public_id = ?
       LIMIT 1`,
      [courierId, claims.public_id]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Akun kurir tidak ditemukan.",
      });
    }

    const courier = rows[0];

    if (["rejected", "suspended"].includes(courier.status)) {
      return res.status(403).json({
        success: false,
        message: "Akun kurir tidak diizinkan mengakses layanan.",
      });
    }

    req.courier = courier;
    return next();
  } catch (err) {
    if (
      err.name === "JsonWebTokenError" ||
      err.name === "TokenExpiredError" ||
      err.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Token kurir tidak valid atau kedaluwarsa.",
      });
    }

    console.error("[COURIER AUTH] Gagal memvalidasi kurir:", err);

    return res.status(500).json({
      success: false,
      message: "Gagal memvalidasi autentikasi kurir.",
    });
  }
};
