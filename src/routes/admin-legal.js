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
        SUM(CASE WHEN verification_status = 'pending' THEN 1 ELSE 0 END) AS pending_businesses
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
        document_archive_available: false,
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
        b.id,
        b.public_id,
        b.business_name,
        b.legal_name,
        b.nib,
        b.kbli_code,
        COALESCE(NULLIF(b.kbli_name, ''), r.title) AS kbli_name,
        b.verification_status,
        b.status,
        b.city,
        b.province,
        b.updated_at
      FROM businesses b
      LEFT JOIN ref_kbli_codes r ON r.code = b.kbli_code
      WHERE (
        ? = ''
        OR b.business_name LIKE ?
        OR COALESCE(b.legal_name, '') LIKE ?
        OR COALESCE(b.nib, '') LIKE ?
        OR COALESCE(b.kbli_code, '') LIKE ?
        OR COALESCE(b.kbli_name, '') LIKE ?
      )
      ORDER BY b.updated_at DESC
      LIMIT 200
    `, [search, like, like, like, like, like]);

    return res.json({ success: true, data: rows });
  } catch (error) {
    return sendError(res, "BUSINESSES", error);
  }
});

// Referensi KBLI: pencarian hanya pada tabel referensi aktif.
router.get("/legal/kbli", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim().slice(0, 100);
    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const like = `%${q}%`;
    const [rows] = await db.execute(`
      SELECT code, title, description, level, parent_code, section_code, source_version
      FROM ref_kbli_codes
      WHERE code LIKE ? OR title LIKE ? OR COALESCE(description, '') LIKE ?
      ORDER BY
        CASE WHEN code = ? THEN 0 WHEN code LIKE ? THEN 1 ELSE 2 END,
        code
      LIMIT 50
    `, [like, like, like, q, `${q}%`]);

    return res.json({ success: true, data: rows });
  } catch (error) {
    return sendError(res, "KBLI", error);
  }
});

module.exports = router;