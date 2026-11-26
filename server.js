/**
 * student/server.js
 * ──────────────────
 * Entry point for the Student API.
 * Loaded by PM2 via ecosystem.config.js.
 *
 * Boot order:
 *   1. Load config (dotenv + validation)
 *   2. Init logger
 *   3. Create Express app
 *   4. Register global middleware
 *   5. Mount routes
 *   6. Register error handlers
 *   7. Start HTTP server
 *   8. Handle graceful shutdown
 */

// ─── 0. Crypto polyfill (must be first — jose v6 needs globalThis.crypto) ─────
const { webcrypto } = require("crypto");
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}
// console.log("crypto polyfill check:", typeof globalThis.crypto, typeof globalThis.crypto?.getRandomValues);

// ─── 1. Config (must be first — loads dotenv) ─────────────────────────────────
const config = require("./src/config");

// ─── 2. Logger ────────────────────────────────────────────────────────────────
const logger = require("../shared/utils/logger");

// ─── 3. Express ───────────────────────────────────────────────────────────────
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const { globalLimiter } = require("../shared/middlewares/rateLimiter");
const { notFound, errorHandler } = require("../shared/middlewares/errorHandler");
const { errorNotifier, captureError } = require("./src/middlewares/errorNotifier");
const routes = require("./src/routes");

const app = express();

// ─── 4. Global middleware ─────────────────────────────────────────────────────

// Security headers
app.use(helmet());

// CORS
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);

    if (config.app.isDev) {
      return callback(null, true);
    }

    if (config.cors.allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    logger.warn(`[CORS] Blocked origin: ${origin}`);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

const CORS_EXEMPT_PATHS = [
  "/api/student/billdesk/payment-callback",
];

app.use((req, res, next) => {
  if (CORS_EXEMPT_PATHS.some((path) => req.path.startsWith(path))) {
    return next(); // skip cors() entirely for this route
  }
  cors(corsOptions)(req, res, next);
});
app.options("*", cors(corsOptions));

// Trust proxy — required when behind NGINX on EC2
app.set("trust proxy", 1);

// Body parsers
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Cookie parser (for httpOnly refresh token cookie)
app.use(cookieParser());


// HTTP request logging
if (config.app.isDev) {
  app.use(morgan("dev"));
} else {
  app.use(morgan("dev"));
  app.use(
    morgan("combined", {
      stream: { write: (msg) => logger.info(msg.trim()) },
      skip: (req) => req.url === "/api/student/health",
    })
  );
}

// Global rate limiter (no-op in dev)
app.use(globalLimiter);

// Report failed requests to the Error Notification app
app.use(errorNotifier);

// ─── 5. Routes ────────────────────────────────────────────────────────────────
app.use("/api/student", routes);

// ─── 6. Error handlers (must be last) ────────────────────────────────────────
app.use(notFound);
app.use(captureError);
app.use(errorHandler);

// ─── 7. Start server ──────────────────────────────────────────────────────────
const PORT = config.app.port;

const server = app.listen(PORT, "127.0.0.1", () => {
  logger.info("─────────────────────────────────────────────────────");
  logger.info(`  SRGI Student API`);
  logger.info(`  ENV  : ${config.app.env}`);
  logger.info(`  PORT : ${PORT}`);
  logger.info(`  URL  : http://127.0.0.1:${PORT}/api/student`);
  logger.info(`  DB   : ${config.db.host}:${config.db.port}/${config.db.name}`);
  if (config.app.isDev) {
    logger.info(`  MODE : Auth passthrough ON — no tokens needed`);
  }
  logger.info("─────────────────────────────────────────────────────");
});

// ─── 8. Graceful shutdown ─────────────────────────────────────────────────────
function shutdown(signal) {
  logger.info(`[Server] ${signal} received — shutting down gracefully`);

  server.close(() => {
    logger.info("[Server] HTTP server closed");
    setTimeout(() => {
      logger.info("[Server] Process exiting");
      process.exit(0);
    }, 500);
  });

  setTimeout(() => {
    logger.error("[Server] Forced exit after timeout");
    process.exit(1);
  }, 10_000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

process.on("uncaughtException", (err) => {
  logger.error(`[Server] uncaughtException: ${err.message}`, { stack: err.stack });
  process.exit(1);
});


module.exports = app;