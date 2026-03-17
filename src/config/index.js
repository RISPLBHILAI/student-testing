/**
 * student/src/config/index.js
 * ────────────────────────────
 * Loads .env from root (D:\app\.env) and exports a typed config object.
 * Crashes early with a clear message if a required variable is missing in production.
 */

const path = require("path");

require("dotenv").config({ path: path.resolve(__dirname, "../../../.env") });

const REQUIRED_IN_PROD = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "JWT_SECRET"];

if (process.env.NODE_ENV === "production") {
  const missing = REQUIRED_IN_PROD.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[Config] Missing required environment variables: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const config = {
  app: {
    name:    "student",
    port:    parseInt(process.env.STUDENT_PORT || process.env.PORT || "3003"),
    env:     process.env.NODE_ENV || "development",
    isDev:   process.env.NODE_ENV !== "production",
    host:    process.env.SERVER_HOST || "http://localhost",
  },

  db: {
    host:      process.env.DB_HOST      || "127.0.0.1",
    port:      parseInt(process.env.DB_PORT || "3306"),
    user:      process.env.DB_USER      || "root",
    password:  process.env.DB_PASSWORD  || "",
    name:      process.env.DB_NAME      || "srgi_db",
    poolLimit: parseInt(process.env.DB_POOL_LIMIT || "10"),
  },

  jwt: {
    secret:           process.env.JWT_SECRET               || "dev-secret-not-for-production",
    accessExpiresIn:  process.env.ACCESS_TOKEN_EXPIRES_IN  || "15m",
    refreshExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || "30d",
  },

  cors: {
    allowedOrigins,
  },

  log: {
    dir: process.env.LOG_DIR || path.resolve(__dirname, "../../../logs"),
  },
};

module.exports = config;