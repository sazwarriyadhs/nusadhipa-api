const pool = require("../db");

/**
 * Usage: requireRole("superadmin")
 * Must be mounted AFTER requireAuth.
 * Role membership is read from the database on every request.
 */
module.exports = function requireRole(...allowedRoles) {
  const required = allowedRoles
    .filter(role => typeof role === "string")
    .map(role => role.trim().toLowerCase())
    .filter(Boolean);

  if (!required.length) {
    throw new Error("requireRole membutuhkan minimal satu role.");
  }

  return async function roleGuard(req, res, next) {
    try {
      if (!req.user || !req.user.id || req.user.status !== "active") {
        return res.status(401).json({
          success: false,
          message: "Autentikasi diperlukan."
        });
      }

      const [rows] = await pool.execute(
        `SELECT r.role_key
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         INNER JOIN users u ON u.id = ur.user_id
         WHERE ur.user_id = ? AND u.status = 'active'`,
        [req.user.id]
      );

      const roles = rows.map(row => String(row.role_key).toLowerCase());
      req.user.roles = roles;

      if (!required.some(role => roles.includes(role))) {
        return res.status(403).json({
          success: false,
          message: "Akses ditolak: role tidak mencukupi."
        });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
};