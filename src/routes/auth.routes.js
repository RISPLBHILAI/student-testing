/**
 * student/src/routes/auth.routes.js
 * ───────────────────────────────────
 * Mounts the shared auth controller with student-specific user lookup.
 *
 * Students log in with admission_no (or email) + password.
 *
 * Endpoints:
 *   POST  /auth/login        → login (public)
 *   POST  /auth/refresh      → refresh access token (public, needs refresh_token)
 *   POST  /auth/logout       → logout current device (protected)
 *   POST  /auth/logout-all   → logout all devices (protected)
 *   GET   /auth/me           → current user info (protected)
 */

const router  = require("express").Router();
const db      = require("../../../shared/db/mysql");
const { makeAuthControllers } = require("../../../shared/controllers/authController");
const { auth }                = require("../../../shared/middlewares/auth");
const { authLimiter }         = require("../../../shared/middlewares/rateLimiter");

// ─── Student-specific user lookup ────────────────────────────────────────────
// Students can log in with either admission_no or email.
// findUser is called with:
//   - a string (admission_no or email) on login
//   - a number (user_id) on token refresh
//
// Adjust the table/column names to match your actual students table.

async function findUser(identifier) {
  const isId = typeof identifier === "number";

  if (isId) {
    // Called from token refresh — look up by primary key
    const [rows] = await db.query(
      `SELECT
         id            AS user_id,
         student_name  AS name,
         email,
         password,
         admission_no,
         branch_id,
         semester,
         'student'     AS role,
         is_active
       FROM tblstud_profile
       WHERE id = ?
         AND is_active = 1
       LIMIT 1`,
      [identifier]
    );
    return rows[0] || null;
  }

  // Called from login — identifier could be admission_no or email
  const sanitized = identifier.trim().toLowerCase();
  const [rows] = await db.query(
    `SELECT
       id            AS user_id,
       student_name  AS name,
       email,
       password,
       admission_no,
       branch_id,
       semester,
       'student'     AS role,
       is_active
     FROM tblstud_profile
     WHERE (LOWER(admission_no) = ? OR LOWER(email) = ?)
       AND is_active = 1
     LIMIT 1`,
    [sanitized, sanitized]
  );

  return rows[0] || null;
}

// ─── Build controllers ────────────────────────────────────────────────────────
const authCtrl = makeAuthControllers({ app: "student", findUser });

// ─── Routes ──────────────────────────────────────────────────────────────────
router.post("/login",       authLimiter,  authCtrl.login);
router.post("/refresh",                   authCtrl.refresh);
router.post("/logout",      auth(),       authCtrl.logout);
router.post("/logout-all",  auth(),       authCtrl.logoutAll);
router.get ("/me",          auth(),       authCtrl.me);

module.exports = router;