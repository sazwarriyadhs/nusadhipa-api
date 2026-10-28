const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/require-auth");
const requireRole = require("../middleware/require-role");

const router = express.Router();

router.use(requireAuth, requireRole("superadmin"));

function sendError(res, label, error) {
  console.error(`[ADMIN LEGAL ${label}]`, error);
  return res.status(500).json({
    success: false,
    message: "Data legalitas gagal diambil. Periksa log API.",
  });
}

// Ringkasan berdasarkan data yang benar-benar tersimpan.
router.get("/legal/summary", async (_req, res) => {
  try {
    const [rows] = await db.execute(`
      SELECT
        COUNT(*) AS total_businesses,
        SUM(CASE WHEN nib IS NOT NULL AND TRIM(nib) <> '' THEN 1 ELSE 0 END) AS businesses_with_nib,
        SUM(CASE WHEN nib IS NULL OR TRIM(nib) = '' THEN 1 ELSE 0 END) AS businesses_without_nib,
        SUM(CASE WHEN verification_status = 'verified' THEN 1 ELSE 0 END) AS verified_businesses,
        SUM(CASE WHEN verification_status = 'pending' THEN 1 ELSE 0 END) AS pending_businesses,
        SUM(CASE WHEN halal_certificate_url IS NOT NULL AND TRIM(halal_certificate_url) <> '' THEN 1 ELSE 0 END) AS businesses_with_halal
      FROM businesses
    `);

    const [kbliRows] = await db.execute(
      "SELECT COUNT(*) AS total FROM ref_kbli_codes"
    );

    return res.json({
      success: true,
      data: {
        ...Object.fromEntries(
          Object.entries(rows[0]).map(([key, value]) => [key, Number(value || 0)])
        ),
        total_kbli_references: Number(kbliRows[0].total || 0),
      },
      meta: {
        document_archive_available: true,
        verification_scope: "internal_database_only",
      },
    });
  } catch (error) {
    return sendError(res, "SUMMARY", error);
  }
});

// Daftar usaha untuk pemeriksaan internal. Tidak mengubah status.
router.get("/legal/businesses", async (req, res) => {
  try {
    const search = String(req.query.search || "").trim().slice(0, 100);
    const like = `%${search}%`;

    const [rows] = await db.execute(`
      SELECT
        id, public_id, business_name, legal_name,
        nib, tax_number, kbli_code, kbli_name,
        halal_certificate_url,
        halal_certificate_number,
        halal_owner_name,
        verification_status, status,
        province, city, address,
        updated_at
      FROM businesses
      WHERE
        (? = '%%' OR
         business_name LIKE ? OR
         legal_name LIKE ? OR
         nib LIKE ? OR
         kbli_code LIKE ? OR
         kbli_name LIKE ?)
      ORDER BY business_name ASC
      LIMIT 200
    `, [like, like, like, like, like, like]);

    return res.json({
      success: true,
      data: rows,
      meta: {
        returned: rows.length,
        max_results: 200,
      },
    });
  } catch (error) {
    return sendError(res, "BUSINESSES", error);
  }
});

// Pencarian referensi KBLI
router.get("/legal/kbli", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }
    const like = `%${q}%`;

    const [rows] = await db.execute(`
      SELECT code, title, description, level, source_version
      FROM ref_kbli_codes
      WHERE code LIKE ? OR title LIKE ? OR description LIKE ?
      ORDER BY code ASC
      LIMIT 50
    `, [like, like, like]);

    return res.json({ success: true, data: rows });
  } catch (error) {
    return sendError(res, "KBLI", error);
  }
});

module.exports = router;