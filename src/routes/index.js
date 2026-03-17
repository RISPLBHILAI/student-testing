/**
 * student/src/routes/index.js
 * ────────────────────────────
 * Central route registry for the student app.
 * Mount new route groups here as the app grows.
 */

const router  = require("express").Router();
const os      = require("os");
const db      = require("../../../shared/db/mysql");
const { sendSuccess, sendError } = require("../../../shared/utils/response");
const config  = require("../config");

// ─── Health check ─────────────────────────────────────────────────────────────
// Public — no auth required.

router.get("/health", async (req, res) => {
  const start = Date.now();

  let dbStatus  = "ok";
  let dbLatency = null;
  try {
    const dbStart = Date.now();
    await db.query("SELECT 1");
    dbLatency = `${Date.now() - dbStart}ms`;
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  const healthy = dbStatus === "ok";

  const payload = {
    app:           config.app.name,
    status:        healthy ? "healthy" : "degraded",
    env:           config.app.env,
    version:       process.env.npm_package_version || "1.0.0",
    uptime:        `${Math.floor(process.uptime())}s`,
    timestamp:     new Date().toISOString(),
    response_time: `${Date.now() - start}ms`,
    checks: {
      database: {
        status:  dbStatus,
        latency: dbLatency,
      },
      memory: {
        heap_used:  `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heap_total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        rss:        `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      },
      system: {
        platform:     os.platform(),
        node_version: process.version,
        cpu_count:    os.cpus().length,
        load_avg:     os.loadavg().map((n) => n.toFixed(2)),
        free_mem:     `${Math.round(os.freemem() / 1024 / 1024)}MB`,
      },
    },
  };

  if (healthy) {
    return sendSuccess(res, payload, "Service is healthy");
  } else {
    return sendError(res, "Service is degraded", 503, payload);
  }
});

// ─── Auth routes (public) ─────────────────────────────────────────────────────
const authRoutes = require("./auth.routes");
router.use("/auth", authRoutes);

// ─── Protected routes (uncomment as you build them) ───────────────────────────
// const { auth } = require("../../../shared/middlewares/auth");
// router.use("/profile",    auth(), require("./profile.routes"));
// router.use("/fees",       auth(), require("./fees.routes"));
// router.use("/attendance", auth(), require("./attendance.routes"));
// router.use("/results",    auth(), require("./results.routes"));

module.exports = router;