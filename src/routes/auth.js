const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const pool = require("../db");

const router = express.Router();
const secretPath = path.resolve(__dirname, "../../.jwt-secret.local");
const JWT_ISSUER = "nusadhipa-marketplace";

function getJwtSecret() {
  // Priority 1: Environment variable (production)
  if (process.env.JWT_SECRET && process.env.JWT_SECRET.trim()) {
    return process.env.JWT_SECRET.trim();
  }

  // Priority 2: File (local dev)
  if (!fs.existsSync(secretPath)) return null;
  const secret = fs.readFileSync(secretPath, "utf8").trim();
  return secret.length >= 32 ? secret : null;
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

router.post("/auth/register", async (req, res, next) => {
  try {
    const fullName =
      typeof req.body?.fullName === "string"
        ? req.body.fullName.trim()
        : "";
    const email = normalizeEmail(req.body?.email);
    const phone =
      typeof req.body?.phone === "string"
        ? req.body.phone.trim()
        : null;
    const password = req.body?.password;

    if (fullName.length < 2 || fullName.length > 150) {
      return res.status(400).json({
        success: false,
        message: "Nama lengkap wajib diisi (2–150 karakter)."
      });
    }

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "Format email tidak valid."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 10 ||
      Buffer.byteLength(password, "utf8") > 72
    ) {
      return res.status(400).json({
        success: false,
        message: "Password wajib minimal 10 karakter dan maksimal 72 byte."
      });
    }

    if (phone !== null && (phone.length > 30 || phone.length === 0)) {
      return res.status(400).json({
        success: false,
        message: "Format nomor telepon tidak valid."
      });
    }

    const secret = getJwtSecret();
    if (!secret) {
      return res.status(503).json({
        success: false,
        message: "Autentikasi belum dikonfigurasi."
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const publicId = crypto.randomUUID();

    // Akun pembeli tidak langsung aktif. Aktivasi admin harus dilakukan
    // melalui mekanisme admin terotorisasi yang akan dibuat terpisah.
    const [result] = await pool.execute(
      `INSERT INTO users
        (public_id, full_name, email, phone, password_hash, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [publicId, fullName, email, phone || null, passwordHash]
    );

    return res.status(201).json({
      success: true,
      message: "Registrasi berhasil. Akun menunggu aktivasi admin.",
      user: {
        id: publicId,
        fullName,
        email,
        status: "pending"
      }
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        success: false,
        message: "Email sudah terdaftar."
      });
    }
    return next(error);
  }
});

router.post("/auth/login", async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || typeof password !== "string" || !password) {
      return res.status(400).json({
        success: false,
        message: "Email dan password wajib diisi."
      });
    }

    const secret = getJwtSecret();
    if (!secret) {
      return res.status(503).json({
        success: false,
        message: "Autentikasi belum dikonfigurasi."
      });
    }

    const [rows] = await pool.execute(
      `SELECT id, public_id, full_name, email, password_hash, status
       FROM users WHERE email = ? LIMIT 1`,
      [email]
    );

    const user = rows[0];

    // Jangan mengeluarkan token untuk akun selain yang aktif.
    if (!user || user.status !== "active") {
      return res.status(401).json({
        success: false,
        message: "Email atau password tidak valid, atau akun belum aktif."
      });
    }

    const passwordOK = await bcrypt.compare(password, user.password_hash);
    if (!passwordOK) {
      return res.status(401).json({
        success: false,
        message: "Email atau password tidak valid."
      });
    }

    const token = jwt.sign(
      {
        sub: String(user.public_id),
        userId: String(user.id),
        email: user.email
      },
      secret,
      { expiresIn: "8h", issuer: JWT_ISSUER }
    );

    await pool.execute(
      "UPDATE users SET last_login_at = NOW() WHERE id = ?",
      [user.id]
    );

    return res.json({
      success: true,
      token,
      tokenType: "Bearer",
      expiresIn: 28800,
      user: {
        id: user.public_id,
        fullName: user.full_name,
        email: user.email
      }
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;