const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/require-auth");
const requireRole = require("../middleware/require-role");

const router = express.Router();
router.use(requireAuth, requireRole("superadmin"));

function sendError(res, label, error) {
  console.error("[LEGAL SERVICE " + label + "]", error);
  return res.status(500).json({ success: false, message: "Operasi legal service gagal." });
}

function getUserId(req) {
  const id = req.user && (req.user.id || req.user.userId || req.user.sub);
  return id ? String(id) : null;
}

router.get("/summary", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT COUNT(*) AS total_tenants, SUM(CASE WHEN legal_service_status = 'submitted' THEN 1 ELSE 0 END) AS submitted, SUM(CASE WHEN legal_service_status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress, SUM(CASE WHEN legal_service_status = 'needs_revision' THEN 1 ELSE 0 END) AS needs_revision, SUM(CASE WHEN legal_service_status = 'issued' THEN 1 ELSE 0 END) AS issued, SUM(CASE WHEN legal_service_status = 'rejected' THEN 1 ELSE 0 END) AS rejected, SUM(CASE WHEN subscription_status = 'trial' THEN 1 ELSE 0 END) AS on_trial, SUM(CASE WHEN subscription_status = 'active' THEN 1 ELSE 0 END) AS active_subscription, SUM(CASE WHEN subscription_status = 'past_due' THEN 1 ELSE 0 END) AS past_due, SUM(CASE WHEN subscription_status = 'suspended' THEN 1 ELSE 0 END) AS suspended, SUM(COALESCE(legal_service_fee, 0)) AS total_legal_revenue, SUM(CASE WHEN subscription_status = 'active' THEN COALESCE(mobile_app_fee, 0) ELSE 0 END) AS monthly_recurring_revenue FROM businesses");
    return res.json({ success: true, data: Object.fromEntries(Object.entries(rows[0]).map(([k, v]) => [k, Number(v || 0)])) });
  } catch (e) { return sendError(res, "SUMMARY", e); }
});

router.get("/pending", async (req, res) => {
  try {
    const [rows] = await db.execute("SELECT b.id, b.public_id, b.business_name, b.legal_name, b.business_type, b.onboarding_type, b.legal_entity, b.nib, b.ahu_number, b.kbli_code, b.kbli_name, b.legal_service_status, b.legal_service_fee, b.legal_completed_at, b.trial_started_at, b.trial_ends_at, b.subscription_status, b.mobile_app_fee, b.province, b.city, b.created_at, u.full_name AS owner_name, u.email AS owner_email, u.phone AS owner_phone FROM businesses b JOIN users u ON u.id = b.owner_user_id WHERE b.onboarding_type = 'A_no_usaha_no_legal' OR b.legal_service_status IN ('submitted', 'in_progress', 'needs_revision', 'issued') ORDER BY CASE b.legal_service_status WHEN 'submitted' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'needs_revision' THEN 3 WHEN 'issued' THEN 4 WHEN 'rejected' THEN 5 ELSE 6 END, b.created_at ASC");
    return res.json({ success: true, data: rows });
  } catch (e) { return sendError(res, "PENDING", e); }
});

router.patch("/:publicId/status", async (req, res) => {
  try {
    const { publicId } = req.params;
    const { status, notes } = req.body || {};
    const userId = getUserId(req);
    const valid = ["submitted", "in_progress", "needs_revision", "issued", "rejected"];
    if (!valid.includes(status)) return res.status(400).json({ success: false, message: "Status tidak valid." });
    const [biz] = await db.execute("SELECT id FROM businesses WHERE public_id = ? LIMIT 1", [publicId]);
    if (!biz.length) return res.status(404).json({ success: false, message: "Tenant tidak ditemukan." });
    const bid = biz[0].id;
    const updates = ["legal_service_status = ?", "updated_at = NOW()"];
    const params = [status];
    if (status === "issued") updates.push("legal_completed_at = NOW()");
    if (status === "rejected") updates.push("can_sell = 1");
    params.push(bid);
    await db.execute("UPDATE businesses SET " + updates.join(", ") + " WHERE id = ?", params);
    await db.execute("INSERT INTO legal_service_logs (business_id, status, notes, changed_by_user_id) VALUES (?, ?, ?, ?)", [bid, status, notes || null, userId]);
    return res.json({ success: true, message: "Status diubah ke " + status });
  } catch (e) { return sendError(res, "UPDATE_STATUS", e); }
});

router.patch("/:publicId/verify", async (req, res) => {
  try {
    const { publicId } = req.params;
    const { notes } = req.body || {};
    const userId = getUserId(req);
    const [biz] = await db.execute("SELECT id, legal_service_status FROM businesses WHERE public_id = ? LIMIT 1", [publicId]);
    if (!biz.length) return res.status(404).json({ success: false, message: "Tenant tidak ditemukan." });
    const b = biz[0];
    if (b.legal_service_status !== "issued") return res.status(400).json({ success: false, message: "Verifikasi hanya setelah issued." });
    const updates = ["verification_status = 'verified'", "trial_started_at = COALESCE(trial_started_at, NOW())", "trial_ends_at = DATE_ADD(NOW(), INTERVAL grace_period_days DAY)", "subscription_status = 'trial'", "updated_at = NOW()"];
    await db.execute("UPDATE businesses SET " + updates.join(", ") + " WHERE id = ?", [b.id]);
    await db.execute("INSERT INTO legal_service_logs (business_id, status, notes, changed_by_user_id) VALUES (?, 'issued', ?, ?)", [b.id, notes || "Dokumen diverifikasi.", userId]);
    return res.json({ success: true, message: "Dokumen terverifikasi." });
  } catch (e) { return sendError(res, "VERIFY", e); }
});

router.get("/:publicId/logs", async (req, res) => {
  try {
    const { publicId } = req.params;
    const [rows] = await db.execute("SELECT l.id, l.status, l.notes, l.created_at, u.full_name AS changed_by_name, u.email AS changed_by_email FROM legal_service_logs l LEFT JOIN users u ON u.id = l.changed_by_user_id JOIN businesses b ON b.id = l.business_id WHERE b.public_id = ? ORDER BY l.created_at DESC", [publicId]);
    return res.json({ success: true, data: rows });
  } catch (e) { return sendError(res, "LOGS", e); }
});

module.exports = router;
