const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const pool = require("../db");

const secretPath = path.resolve(__dirname, "../../.jwt-secret.local");
const JWT_ISSUER = "nusadhipa-marketplace";

function getJwtSecret() {
  if (!fs.existsSync(secretPath)) return null;
  const secret = fs.readFileSync(secretPath, "utf8").trim();
  return secret.length >= 32 ? secret : null;
}

module.exports = async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const match = header.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      return res.status(401).json({
        success: false,
        message: "Token autentikasi diperlukan."
      });
    }

    const secret = getJwtSecret();
    if (!secret) {
      return res.status(503).json({
        success: false,
        message: "Autentikasi belum dikonfigurasi."
      });
    }

    const claims = jwt.verify(match[1], secret, {
      issuer: JWT_ISSUER,
      algorithms: ["HS256"]
    });

    if (!claims.sub || !claims.userId) {
      return res.status(401).json({
        success: false,
        message: "Token autentikasi tidak valid."
      });
    }

    // Periksa status terkini di database, bukan hanya klaim token.
    const [rows] = await pool.execute(
      `SELECT id, public_id, full_name, email, status
       FROM users WHERE public_id = ? LIMIT 1`,
      [String(claims.sub)]
    );

    const user = rows[0];
    if (!user || user.status !== "active") {
      return res.status(403).json({
        success: false,
        message: "Akun belum aktif atau tidak memiliki akses."
      });
    }

    req.user = {
      id: user.id,
      publicId: user.public_id,
      fullName: user.full_name,
      email: user.email,
      status: user.status
    };

    return next();
  } catch (error) {
    if (
      error.name === "JsonWebTokenError" ||
      error.name === "TokenExpiredError" ||
      error.name === "NotBeforeError"
    ) {
      return res.status(401).json({
        success: false,
        message: "Token tidak valid atau sudah kedaluwarsa."
      });
    }

    return next(error);
  }
};