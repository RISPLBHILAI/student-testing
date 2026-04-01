/**
 * emp/src/routes/admin.routes.js
 * ───────────────────────────────
 * Admin-only endpoints.
 *
 * GET  /admin/active-users           → real-time online employees
 * GET  /admin/active-users/history   → daily active users over date range
 * POST /admin/invalidate-all-tokens  → force logout all employees
 */

const router       = require("express").Router();
const { auth }     = require("../../../shared/middlewares/auth");
const activeUsers  = require("../controllers/admin/activeUsers.controller");
const adminController  = require("../controllers/admin/admin.controller");


// All admin routes require admin role
router.get ("/active-users",          auth({ roles: ["admin"] }), activeUsers.getRealTimeActive);
router.get ("/active-users/history",  auth({ roles: ["admin"] }), activeUsers.getHistory);
router.post("/invalidate-all-tokens", auth({ roles: ["admin"] }), activeUsers.invalidateAllTokens);

// Endpoints that control student switching
router.get('/search-students', adminController.searchStudents);
router.post('/impersonate-student', adminController.impersonateStudent);

module.exports = router;