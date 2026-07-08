/**
 * emp/src/routes/index.js
 * ────────────────────────
 * Central route registry for the emp app.
 * Mount new route groups here as the app grows.
 */

const router = require("express").Router();
const os = require("os");
const db = require("../../../shared/db/mysql");
const { auth } = require("../../../shared/middlewares/auth");
const { sendSuccess, sendError } = require("../../../shared/utils/response");
const config = require("../config");

// ─── Health check ─────────────────────────────────────────────────────────────
// Public — no auth required. Used by NGINX, PM2, AWS health checks, Postman smoke tests.

router.get("/health", async (req, res) => {
  const start = Date.now();

  // Check DB connectivity
  let dbStatus = "ok";
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
    app: config.app.name,
    status: healthy ? "healthy" : "degraded",
    env: config.app.env,
    version: process.env.npm_package_version || "1.0.0",
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
    response_time: `${Date.now() - start}ms`,
    checks: {
      database: {
        status: dbStatus,
        latency: dbLatency,
      },
      memory: {
        heap_used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        heap_total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
      },
      system: {
        platform: os.platform(),
        node_version: process.version,
        cpu_count: os.cpus().length,
        load_avg: os.loadavg().map((n) => n.toFixed(2)),
        free_mem: `${Math.round(os.freemem() / 1024 / 1024)}MB`,
      },
    },
  };

  if (healthy) {
    return sendSuccess(res, payload, "Service is healthy");
  } else {
    return sendError(res, "Service is degraded", 503, payload);
  }
});

// ─── Auth routes (public) ──────────────────────────────────────────────────────
const authRoutes = require("./auth.routes");
const adminRoutes = require("./admin.routes");
const dashboardRoutes = require("./dashboard.routes");
const studentRoutes = require("./student.routes");
const notificationRoutes = require("./notification.routes");
const attendanceRoutes = require("./attendence.routes");
const timetableRoutes = require("./timetable.routes");
const notesRoutes = require("./notes.routes");
const questionRoutes = require("./question.routes");
const libraryRoutes = require("./library.routes");
const complaintRoutes = require("./complaint.routes");
const feeRoutes = require("./fee.routes");
const billDeskRoutes = require("./billdesk.routes");


router.use("/auth", authRoutes);
router.use("/admin", adminRoutes);
router.use("/dashboard", dashboardRoutes);
router.use("/student", studentRoutes);
router.use("/notification", notificationRoutes);
router.use("/attendance", attendanceRoutes);
router.use("/timetable", timetableRoutes);
router.use("/notes", notesRoutes);
router.use("/question-bank", questionRoutes);
router.use("/library", libraryRoutes);
router.use("/complaints", complaintRoutes);
router.use("/fees", feeRoutes);
router.use("/billdesk", billDeskRoutes);

// ─── Protected routes (add more groups below as you build them) ────────────────
// router.use("/employees",  auth(), require("./employee.routes"));
// router.use("/attendance", auth(), require("./attendance.routes"));
// router.use("/salary",     auth(), require("./salary.routes"));

module.exports = router;