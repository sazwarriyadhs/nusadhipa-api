require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const pool = require("./db");

const app = express();
const port = Number(process.env.PORT || 4000);
const host = process.env.HOST || "127.0.0.1";

const allowedOrigins = (process.env.CORS_ORIGINS ||
  "http://localhost:3004,http://127.0.0.1:3004")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

// Pattern untuk dev — semua localhost + LAN IP (Flutter Web port random)
const devOriginPatterns = [
  /^http:\/\/localhost(:\d+)?$/,
  /^http:\/\/127\.0\.0\.1(:\d+)?$/,
  /^http:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
  /^http:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/,
];

app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (process.env.NODE_ENV !== "production") return callback(null, true);
    if (
      allowedOrigins.includes(origin) ||
      devOriginPatterns.some((p) => p.test(origin))
    ) {
      return callback(null, true);
    }
    return callback(new Error("Origin tidak diizinkan oleh CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json({ limit: "1mb" }));

// ===== Static file serving untuk gambar upload =====
const path = require("path");
const publicDir = path.resolve(__dirname, "../public");
app.use("/uploads", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
}, express.static(path.join(publicDir, "uploads")));
console.log(`📁 Static /uploads → ${path.join(publicDir, "uploads")}`);

// Serve folder /sauri — gambar produk SAURI (bundled)
app.use("/sauri", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
}, express.static(path.join(publicDir, "sauri")));
console.log(`📁 Static /sauri → ${path.join(publicDir, "sauri")}`);

app.get("/api/v1/health", (_req, res) => {
  res.json({
    success: true,
    service: "nusadhipa-marketplace-api",
    status: "ok"
  });
});

app.get("/api/v1/health/db", async (_req, res) => {
  let connection;

  try {
    connection = await pool.getConnection();

    const [rows] = await connection.query(
      "SELECT DATABASE() AS database_name, VERSION() AS database_version"
    );

    const db = rows[0];

    if (db.database_name !== (process.env.DB_NAME || "nusadhipa_marketplace")) {
      return res.status(503).json({
        success: false,
        error: "Database aktif tidak sesuai konfigurasi marketplace"
      });
    }

    return res.json({
      success: true,
      database: db.database_name,
      server_version: db.database_version
    });
  } catch (error) {
    console.error("Database health check failed:", error.code || error.message);

    return res.status(503).json({
      success: false,
      error: "Koneksi database gagal. Periksa konfigurasi lokal."
    });
  } finally {
    if (connection) connection.release();
  }
});

// ===== Daftar route API =====
app.use("/api/v1", require("./routes/auth"));
app.use("/api/v1", require("./routes/business-locations"));
app.use("/api/v1", require("./routes/business"));
app.use("/api/v1", require("./routes/orders"));
app.use("/api/v1", require("./routes/cart"));
app.use("/api/v1", require("./routes/shipments"));
app.use("/api/v1", require("./routes/reports"));
app.use("/api/v1", require("./routes/uploads"));
app.use("/api/v1", require("./routes/catalog"));
app.use("/api/v1", require("./routes/market-insight"));
app.use("/api/v1/courier", require("./routes/courier"));
app.use("/api/v1/customer", require("./routes/customer"));

// ===== Route admin =====
app.use("/api/v1/admin", require("./routes/admin"));
app.use("/api/v1/admin", require("./routes/admin-finance"));
app.use("/api/v1/admin", require("./routes/admin-settings"));
app.use("/api/v1/admin", require("./routes/admin-legal"));

// ===== Route legal service (BARU) =====
app.use("/api/v1/admin/legal-service", require("./routes/legal-service"));

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Endpoint tidak ditemukan"
  });
});

app.use((err, _req, res, _next) => {
  if (err.message === "Origin tidak diizinkan oleh CORS") {
    return res.status(403).json({
      success: false,
      error: err.message
    });
  }

  console.error("Unhandled request error:", err.stack || err);
  return res.status(500).json({
    success: false,
    error: "Terjadi kesalahan internal"
  });
});

let server;

async function shutdown() {
  if (server) {
    server.close();
  }

  await pool.end().catch(() => {});
  process.exitCode = 0;
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server = app.listen(port, host, () => {
  console.log(`NUSA-DHIPA Marketplace API: http://${host}:${port}`);
  console.log(`Health: http://${host}:${port}/api/v1/health`);
});

module.exports = app;
