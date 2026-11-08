const db = require("../db");

module.exports = async function requireBusiness(req, res, next) {
  try {
    const userId = Number(req.user?.id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(401).json({
        success: false,
        message: "Autentikasi pengguna diperlukan.",
      });
    }

    const [businesses] = await db.execute(
      `SELECT id, public_id, business_name, slug, status
       FROM businesses
       WHERE owner_user_id = ?
         AND status IN ("draft", "active")
       ORDER BY id ASC`,
      [userId]
    );

    if (businesses.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Bisnis tidak ditemukan untuk akun ini.",
      });
    }

    const requestedBusinessId = String(req.headers["x-business-id"] || "").trim();
    let business;

    if (requestedBusinessId) {
      business = businesses.find(
        (item) => String(item.public_id) === requestedBusinessId
      );

      if (!business) {
        return res.status(403).json({
          success: false,
          message: "Anda tidak memiliki akses ke bisnis yang dipilih.",
        });
      }
    } else if (businesses.length === 1) {
      business = businesses[0];
    } else {
      return res.status(409).json({
        success: false,
        code: "BUSINESS_SELECTION_REQUIRED",
        message: "Pilih bisnis yang akan dikelola melalui header X-Business-ID.",
        data: businesses.map((item) => ({
          public_id: item.public_id,
          business_name: item.business_name,
          slug: item.slug,
          status: item.status,
        })),
      });
    }

    req.business = {
      id: business.id,
      publicId: business.public_id,
      name: business.business_name,
      slug: business.slug,
      status: business.status,
    };

    return next();
  } catch (error) {
    return next(error);
  }
};
