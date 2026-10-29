const requireRole = require("../middleware/require-role");
const requireAuth = require("../middleware/require-auth");

const express = require("express");
const router = express.Router();
const db = require("../db");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const requireCourierAuth = require("../middleware/require-courier-auth");

const VALID_COURIER_STATUSES = ["approved", "rejected", "suspended"];
const VALID_PAYOUT_METHODS = ["bank_transfer", "ewallet"];
const PARTNERSHIP_TYPE = "freelance";

const PROFILE_FIELDS = {
  phone: { max: 30 },
  vehicle_type: { max: 50 },
  plate_number: { max: 20 },
  city: { max: 100 },
  payout_account: { max: 100 },
};

function sendError(res, err, message) {
  console.error(`[COURIER] ${message}:`, err);
  return res.status(500).json({
    success: false,
    message: "Terjadi kesalahan pada layanan kurir.",
  });
}

// Haversine distance (km)
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function parseMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : 0;
}

function cleanProfileField(value, maxLength) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;

  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) return undefined;

  return cleaned;
}

function publicCourier(courier) {
  return {
    id: courier.id,
    public_id: courier.public_id,
    name: courier.name,
    email: courier.email,
    phone: courier.phone,
    vehicle_type: courier.vehicle_type,
    partnership_type: courier.partnership_type || PARTNERSHIP_TYPE,
    plate_number: courier.plate_number,
    city: courier.city,
    payout_method: courier.payout_method,
    payout_account: courier.payout_account,
    status: courier.status,
    created_at: courier.created_at,
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validPayoutMethod(method) {
  return VALID_PAYOUT_METHODS.includes(method);
}

const COURIER_SELECT = `
  id, public_id, name, email, phone,
  vehicle_type,
  COALESCE(partnership_type, 'freelance') AS partnership_type,
  plate_number, city, payout_method, payout_account,
  status, created_at
`;

// ============================================================
// COURIER PROFILE
// ============================================================

router.get("/profile", requireCourierAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT ${COURIER_SELECT}
       FROM couriers
       WHERE id = ?
       LIMIT 1`,
      [req.courier.id]
    );

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Profil kurir tidak ditemukan.",
      });
    }

    return res.json({
      success: true,
      data: publicCourier(rows[0]),
    });
  } catch (err) {
    return sendError(res, err, "Gagal mengambil profil");
  }
});

router.put("/profile", requireCourierAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const updates = [];
    const values = [];

    for (const [field, config] of Object.entries(PROFILE_FIELDS)) {
      if (body[field] === undefined) continue;

      const value = cleanProfileField(body[field], config.max);

      if (value === undefined) {
        return res.status(400).json({
          success: false,
          message: `Field ${field} tidak valid atau terlalu panjang.`,
        });
      }

      updates.push(`${field} = ?`);
      values.push(value);
    }

    if (body.payout_method !== undefined) {
      const method =
        body.payout_method === null || body.payout_method === ""
          ? null
          : body.payout_method;

      if (method !== null && !validPayoutMethod(method)) {
        return res.status(400).json({
          success: false,
          message: "Metode pencairan harus bank_transfer atau ewallet.",
        });
      }

      updates.push("payout_method = ?");
      values.push(method);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "Tidak ada data profil yang dikirim untuk diperbarui.",
      });
    }

    const [currentRows] = await db.execute(
      `SELECT payout_method, payout_account
       FROM couriers
       WHERE id = ?
       LIMIT 1`,
      [req.courier.id]
    );

    if (!currentRows.length) {
      return res.status(404).json({
        success: false,
        message: "Profil kurir tidak ditemukan.",
      });
    }

    const current = currentRows[0];

    const nextMethod =
      body.payout_method !== undefined
        ? body.payout_method || null
        : current.payout_method;

    const nextAccount =
      body.payout_account !== undefined
        ? cleanProfileField(body.payout_account, 100)
        : current.payout_account;

    if (nextAccount === undefined) {
      return res.status(400).json({
        success: false,
        message: "Nomor rekening atau akun pencairan tidak valid.",
      });
    }

    if (Boolean(nextMethod) !== Boolean(nextAccount)) {
      return res.status(400).json({
        success: false,
        message:
          "Metode dan rekening pencairan harus diisi bersama atau dikosongkan bersama.",
      });
    }

    if (nextMethod && !validPayoutMethod(nextMethod)) {
      return res.status(400).json({
        success: false,
        message: "Metode pencairan tidak valid.",
      });
    }

    values.push(req.courier.id);

    await db.execute(
      `UPDATE couriers
       SET ${updates.join(", ")}
       WHERE id = ?`,
      values
    );

    const [rows] = await db.execute(
      `SELECT ${COURIER_SELECT}
       FROM couriers
       WHERE id = ?
       LIMIT 1`,
      [req.courier.id]
    );

    return res.json({
      success: true,
      message: "Profil kurir berhasil diperbarui.",
      data: publicCourier(rows[0]),
    });
  } catch (err) {
    return sendError(res, err, "Gagal memperbarui profil");
  }
});

// ============================================================
// AVAILABLE COURIERS (buat Tenant)
// ============================================================
router.get("/available", requireAuth, async (req, res) => {
  try {
    const bizLat = parseFloat(req.query.lat);
    const bizLng = parseFloat(req.query.lng);
    const radiusKm = parseFloat(req.query.radius) || 5;

    if (!Number.isFinite(bizLat) || !Number.isFinite(bizLng)) {
      return res.status(400).json({ success: false, message: "Lokasi tenant (lat/lng) wajib diisi." });
    }

    const [couriers] = await db.execute(
      `SELECT c.id, c.public_id, c.name, c.phone, c.vehicle_type, c.city, c.avatar_url,
              c.latitude, c.longitude,
         (SELECT COUNT(*) FROM orders o 
          WHERE o.courier_id = c.id 
            AND o.claim_status = 'taken' 
            AND o.status NOT IN ('completed','cancelled')) AS active_orders
       FROM couriers c
       WHERE c.status = 'approved'
         AND c.latitude IS NOT NULL 
         AND c.longitude IS NOT NULL`
    );

    const available = couriers
      .map(c => ({
        ...c,
        distance_km: haversineDistance(bizLat, bizLng, parseFloat(c.latitude), parseFloat(c.longitude)),
      }))
      .filter(c => c.distance_km <= radiusKm )
      .sort((a, b) => a.distance_km - b.distance_km);

    return res.json({ success: true, data: available });
  } catch (err) {
    console.error("[COURIER AVAILABLE] Error:", err);
    return sendError(res, err, "Gagal mengambil daftar kurir");
  }
});

// ============================================================
// AVAILABLE ROUTES (buat Kurir — order requested)
// ============================================================
router.get("/routes", requireCourierAuth, async (req, res) => {
  if (req.courier.status !== "approved") {
    return res.status(403).json({ success: false, message: "Hanya kurir approved yang bisa lihat rute." });
  }

  try {
    const [courierRows] = await db.execute(
      `SELECT latitude, longitude FROM couriers WHERE id = ? LIMIT 1`,
      [req.courier.id]
    );
    const courierLat = parseFloat(courierRows[0]?.latitude);
    const courierLng = parseFloat(courierRows[0]?.longitude);
    const radiusKm = parseFloat(req.query.radius) || 5;

    const [orders] = await db.execute(
      `SELECT o.id, o.public_id, o.order_number, o.grand_total,
              o.shipping_distance_km, o.shipping_lat, o.shipping_lng,
              o.claim_status, o.status, o.shipping_address,
              u.full_name AS buyer_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_user_id
       WHERE o.claim_status = 'requested' AND o.courier_id IS NULL
         AND o.shipping_lat IS NOT NULL 
         AND o.shipping_lng IS NOT NULL
       ORDER BY o.placed_at ASC`
    );

    let filtered = orders;
    if (Number.isFinite(courierLat) && Number.isFinite(courierLng)) {
      filtered = orders
        .map(o => ({
          ...o,
          distance_from_courier_km: haversineDistance(
            courierLat, courierLng,
            parseFloat(o.shipping_lat), parseFloat(o.shipping_lng)
          ),
        }))
        .filter(o => o.distance_from_courier_km <= radiusKm)
        .sort((a, b) => a.distance_from_courier_km - b.distance_from_courier_km);
    }

    return res.json({ success: true, data: filtered });
  } catch (err) {
    console.error("[COURIER ROUTES] Error:", err);
    return sendError(res, err, "Gagal mengambil rute");
  }
});

// ============================================================
// CLAIM ROUTE (buat Kurir)
// ============================================================
router.post("/routes/:id/claim", requireCourierAuth, async (req, res) => {
  const routeId = parseId(req.params.id);

  if (!routeId) {
    return res.status(400).json({
      success: false,
      message: "ID rute tidak valid.",
    });
  }

  if (req.courier.status !== "approved") {
    return res.status(403).json({
      success: false,
      message: "Akun kurir belum disetujui.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [orders] = await connection.execute(
      `SELECT id, order_number, claim_status
       FROM orders
       WHERE id = ?
       FOR UPDATE`,
      [routeId]
    );

    if (!orders.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Order tidak ditemukan.",
      });
    }

    if (orders[0].claim_status === "taken") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Order sudah diambil kurir lain.",
      });
    }

    await connection.execute(
      `UPDATE orders
       SET courier_id = ?, claim_status = 'taken', claimed_at = NOW()
       WHERE id = ?`,
      [req.courier.id, routeId]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Rute berhasil diklaim.",
      data: { order_number: orders[0].order_number },
    });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    return sendError(res, err, "Gagal klaim rute");
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// MY ROUTES
// ============================================================
router.get("/routes/mine", requireCourierAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT id, route_code, area, order_ids, customers,
              weight_kg, fee, status, created_at
       FROM courier_routes
       WHERE courier_id = ?
         AND status IN ('taken', 'completed')
       ORDER BY created_at DESC`,
      [req.courier.id]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    return sendError(res, err, "Gagal mengambil daftar rute kurir");
  }
});

// ============================================================
// COMPLETE ROUTE
// ============================================================
router.post("/routes/:id/complete", requireCourierAuth, async (req, res) => {
  const routeId = parseId(req.params.id);

  if (!routeId) {
    return res.status(400).json({
      success: false,
      message: "ID rute tidak valid.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [routes] = await connection.execute(
      `SELECT id, fee, status
       FROM courier_routes
       WHERE id = ? AND courier_id = ?
       FOR UPDATE`,
      [routeId, req.courier.id]
    );

    if (!routes.length) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "Rute tidak ditemukan untuk akun kurir ini.",
      });
    }

    if (routes[0].status !== "taken") {
      await connection.rollback();
      return res.status(409).json({
        success: false,
        message: "Rute tidak berstatus sedang dikerjakan.",
      });
    }

    await connection.execute(
      `UPDATE courier_routes
       SET status = 'completed'
       WHERE id = ? AND courier_id = ?`,
      [routeId, req.courier.id]
    );

    await connection.execute(
      `INSERT INTO courier_earnings
         (courier_id, route_id, amount, status)
       VALUES (?, ?, ?, 'available')`,
      [req.courier.id, routeId, parseMoney(routes[0].fee)]
    );

    await connection.execute(
      `UPDATE courier_claims
       SET status = 'completed'
       WHERE courier_id = ? AND route_id = ?`,
      [req.courier.id, routeId]
    );

    await connection.commit();

    return res.json({
      success: true,
      message: "Rute berhasil diselesaikan.",
    });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    return sendError(res, err, "Gagal menyelesaikan rute");
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// EARNINGS
// ============================================================
router.get("/earnings", requireCourierAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         e.id, e.route_id, e.amount, e.status, e.created_at,
         cr.route_code, cr.area
       FROM courier_earnings e
       LEFT JOIN courier_routes cr ON cr.id = e.route_id
       WHERE e.courier_id = ?
       ORDER BY e.created_at DESC`,
      [req.courier.id]
    );

    const [summaryRows] = await db.execute(
      `SELECT
         COALESCE(SUM(CASE WHEN status = 'available' THEN amount ELSE 0 END), 0)
           AS available_balance,
         COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)
           AS pending_balance,
         COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0)
           AS total_paid
       FROM courier_earnings
       WHERE courier_id = ?`,
      [req.courier.id]
    );

    return res.json({
      success: true,
      summary: summaryRows[0],
      data: rows,
    });
  } catch (err) {
    return sendError(res, err, "Gagal mengambil pendapatan");
  }
});

// ============================================================
// COMPLETED DELIVERIES
// ============================================================
router.get("/deliveries", requireCourierAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT o.id, o.public_id, o.order_number, o.grand_total,
              o.shipping_distance_km, o.shipping_lat, o.shipping_lng,
              o.claim_status, o.status, o.shipping_address,
              u.full_name AS buyer_name
       FROM orders o
       LEFT JOIN users u ON u.id = o.buyer_user_id
       WHERE o.courier_id = ? 
         AND o.claim_status IN ('taken', 'completed')
       ORDER BY o.claimed_at DESC`,
      [req.courier.id]
    );
    return res.json({ success: true, data: rows });
  } catch (err) {
    return sendError(res, err, "Gagal mengambil riwayat pengantaran");
  }
});

// ============================================================
// REQUEST PAYOUT
// ============================================================
router.post("/payouts", requireCourierAuth, async (req, res) => {
  const method = req.body?.method;
  const accountNumber =
    typeof req.body?.account_number === "string"
      ? req.body.account_number.trim()
      : "";

  if (!validPayoutMethod(method)) {
    return res.status(400).json({
      success: false,
      message: "Metode pencairan harus bank_transfer atau ewallet.",
    });
  }

  if (!accountNumber || accountNumber.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Nomor rekening atau akun pencairan wajib diisi dan maksimal 100 karakter.",
    });
  }

  if (req.courier.status !== "approved") {
    return res.status(403).json({
      success: false,
      message: "Akun kurir belum disetujui untuk pencairan.",
    });
  }

  let connection;

  try {
    connection = await db.getConnection();
    await connection.beginTransaction();

    const [couriers] = await connection.execute(
      `SELECT id, status
       FROM couriers
       WHERE id = ?
       FOR UPDATE`,
      [req.courier.id]
    );

    if (!couriers.length || couriers[0].status !== "approved") {
      await connection.rollback();
      return res.status(403).json({
        success: false,
        message: "Akun kurir tidak memenuhi syarat pencairan.",
      });
    }

    const [earningRows] = await connection.execute(
      `SELECT id, amount
       FROM courier_earnings
       WHERE courier_id = ? AND status = 'available'
       FOR UPDATE`,
      [req.courier.id]
    );

    const amount = earningRows.reduce(
      (total, earning) => total + parseMoney(earning.amount),
      0
    );

    if (amount <= 0 || earningRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "Tidak ada saldo tersedia untuk dicairkan.",
      });
    }

    const [payoutResult] = await connection.execute(
      `INSERT INTO courier_payouts
         (courier_id, amount, method, account_number, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [req.courier.id, amount, method, accountNumber]
    );

    for (const earning of earningRows) {
      await connection.execute(
        `UPDATE courier_earnings
         SET status = 'pending'
         WHERE id = ? AND courier_id = ? AND status = 'available'`,
        [earning.id, req.courier.id]
      );
    }

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: "Permintaan pencairan berhasil dibuat.",
      data: {
        payout_id: payoutResult.insertId,
        amount,
        method,
        status: "pending",
      },
    });
  } catch (err) {
    if (connection) await connection.rollback().catch(() => {});
    return sendError(res, err, "Gagal membuat permintaan pencairan");
  } finally {
    if (connection) connection.release();
  }
});

// ============================================================
// PAYOUT HISTORY
// ============================================================
router.get("/payouts", requireCourierAuth, async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         id, amount, method, account_number, status, created_at
       FROM courier_payouts
       WHERE courier_id = ?
       ORDER BY created_at DESC`,
      [req.courier.id]
    );

    return res.json({ success: true, data: rows });
  } catch (err) {
    return sendError(res, err, "Gagal mengambil riwayat pencairan");
  }
});

// ============================================================
// REGISTER — FREELANCE ONLY
// ============================================================
router.post("/register", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      password,
      vehicle_type,
      plate_number,
      city,
      payout_method,
      payout_account,
    } = req.body || {};

    const cleanName = typeof name === "string" ? name.trim() : "";
    const cleanEmail =
      typeof email === "string" ? email.trim().toLowerCase() : "";
    const cleanPassword = typeof password === "string" ? password : "";

    if (!cleanName || cleanName.length > 190) {
      return res.status(400).json({
        success: false,
        message: "Nama wajib diisi dan maksimal 190 karakter.",
      });
    }

    if (!validEmail(cleanEmail) || cleanEmail.length > 190) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid.",
      });
    }

    if (cleanPassword.length < 8 || cleanPassword.length > 128) {
      return res.status(400).json({
        success: false,
        message: "Password wajib 8 sampai 128 karakter.",
      });
    }

    const profileInput = {
      phone: phone ?? null,
      vehicle_type: vehicle_type ?? null,
      plate_number: plate_number ?? null,
      city: city ?? null,
      payout_account: payout_account ?? null,
    };

    for (const [field, config] of Object.entries(PROFILE_FIELDS)) {
      const value = cleanProfileField(profileInput[field], config.max);

      if (value === undefined) {
        return res.status(400).json({
          success: false,
          message: `Field ${field} tidak valid atau terlalu panjang.`,
        });
      }

      profileInput[field] = value;
    }

    const cleanPayoutMethod = payout_method || null;

    if (
      cleanPayoutMethod !== null &&
      !validPayoutMethod(cleanPayoutMethod)
    ) {
      return res.status(400).json({
        success: false,
        message: "Metode pencairan harus bank_transfer atau ewallet.",
      });
    }

    if (Boolean(cleanPayoutMethod) !== Boolean(profileInput.payout_account)) {
      return res.status(400).json({
        success: false,
        message:
          "Metode dan rekening pencairan harus diisi bersama atau dikosongkan bersama.",
      });
    }

    const [existing] = await db.execute(
      `SELECT id FROM couriers WHERE email = ? LIMIT 1`,
      [cleanEmail]
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Email sudah terdaftar.",
      });
    }

    const passwordHash = await bcrypt.hash(cleanPassword, 12);
    const publicId = crypto.randomUUID();

    const [result] = await db.execute(
      `INSERT INTO couriers
         (public_id, name, email, phone, password_hash,
          vehicle_type, partnership_type, plate_number, city,
          payout_method, payout_account, status)
       VALUES (?, ?, ?, ?, ?, ?, 'freelance', ?, ?, ?, ?, 'pending')`,
      [
        publicId,
        cleanName,
        cleanEmail,
        profileInput.phone,
        passwordHash,
        profileInput.vehicle_type,
        profileInput.plate_number,
        profileInput.city,
        cleanPayoutMethod,
        profileInput.payout_account,
      ]
    );

    return res.status(201).json({
      success: true,
      message: "Pendaftaran kurir freelance berhasil. Akun menunggu persetujuan admin.",
      data: {
        id: result.insertId,
        public_id: publicId,
        name: cleanName,
        email: cleanEmail,
        partnership_type: PARTNERSHIP_TYPE,
        status: "pending",
      },
    });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email kurir sudah terdaftar.",
      });
    }

    return sendError(res, err, "Gagal mendaftarkan kurir");
  }
});

// ============================================================
// LOGIN
// ============================================================
router.post("/login", async (req, res) => {
  try {
    const email =
      typeof req.body?.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const password =
      typeof req.body?.password === "string"
        ? req.body.password
        : "";

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi.",
      });
    }

    const [rows] = await db.execute(
      `SELECT *
       FROM couriers
       WHERE email = ?
       LIMIT 1`,
      [email]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    const courier = rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      courier.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        success: false,
        message: "Email atau password salah.",
      });
    }

    if (courier.status !== "approved") {
      return res.status(403).json({
        success: false,
        message:
          courier.status === "pending"
            ? "Akun kurir masih menunggu persetujuan admin."
            : "Akun kurir tidak dapat digunakan.",
        status: courier.status,
      });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret || secret.trim().length < 32) {
      return res.status(503).json({
        success: false,
        message: "Layanan autentikasi belum dikonfigurasi dengan benar.",
      });
    }

    const token = jwt.sign(
      {
        id: courier.id,
        public_id: courier.public_id,
        email: courier.email,
        role: "courier",
      },
      secret.trim(),
      {
        algorithm: "HS256",
        expiresIn: "7d",
      }
    );

    return res.json({
      success: true,
      message: "Login kurir berhasil.",
      token,
      data: publicCourier(courier),
    });
  } catch (err) {
    return sendError(res, err, "Gagal login kurir");
  }
});

// ============================================================
// ADMIN: LIST COURIERS
// ============================================================
router.get("/admin/list", requireAuth, requireRole("superadmin"), async (req, res) => {
  try {
    const [rows] = await db.execute(
      `SELECT
         id, public_id, name, email, phone,
         vehicle_type,
         COALESCE(partnership_type, 'freelance') AS partnership_type,
         plate_number, city, payout_method, status, created_at
       FROM couriers
       ORDER BY created_at DESC`
    );

    return res.json({
      success: true,
      data: rows,
    });
  } catch (err) {
    return sendError(res, err, "Gagal mengambil daftar kurir");
  }
});

// ============================================================
// ADMIN: CHANGE COURIER STATUS
// ============================================================
router.put("/admin/:id/status", requireAuth, requireRole("superadmin"), async (req, res) => {
  const courierId = parseId(req.params.id);
  const status = req.body?.status;

  if (!courierId) {
    return res.status(400).json({
      success: false,
      message: "ID kurir tidak valid.",
    });
  }

  if (!VALID_COURIER_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: "Status harus approved, rejected, atau suspended.",
    });
  }

  try {
    const [result] = await db.execute(
      `UPDATE couriers
       SET status = ?
       WHERE id = ?`,
      [status, courierId]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        success: false,
        message: "Kurir tidak ditemukan.",
      });
    }

    return res.json({
      success: true,
      message: "Status kurir berhasil diperbarui.",
      data: {
        id: courierId,
        status,
      },
    });
  } catch (err) {
    return sendError(res, err, "Gagal memperbarui status kurir");
  }
});

module.exports = router;



