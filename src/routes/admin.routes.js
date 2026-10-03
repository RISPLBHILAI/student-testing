/**
 * student/src/routes/admin.routes.js
 * ───────────────────────────────────
 * Student-app admin endpoints (admin impersonation).
 *
 * GET  /admin/search-students       → search students to act as
 * POST /admin/impersonate-student   → issue a token for the chosen student
 */

const router       = require("express").Router();
const { auth }     = require("../../../shared/middlewares/auth");
const { sendError } = require("../../../shared/utils/response");
const config       = require("../config");
const adminController  = require("../controllers/admin/admin.controller");

// Student-app admin = the token issued by the admin branch of verifyOtp
// (isAdmin: true, app: "student"), and its mobile must still be
// config.admin.mobile — so changing that number cuts off old tokens.
function requireStudentAdmin(req, res, next) {
    const u = req.user || {};
    if (u.isAdmin !== true || u.app !== "student" || u.mobile !== config.admin.mobile) {
        return sendError(res, "Admin access required", 403);
    }
    return next();
}

// Endpoints that control student switching
router.get('/search-students', auth(), requireStudentAdmin, adminController.searchStudents);
router.post('/impersonate-student', auth(), requireStudentAdmin, adminController.impersonateStudent);

module.exports = router;