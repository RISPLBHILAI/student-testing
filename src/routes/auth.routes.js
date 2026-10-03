
const router   = require("express").Router();
const { auth } = require("../../../shared/middlewares/auth");
const { authLimiter, otpLimiter } = require("../../../shared/middlewares/rateLimiter");
const tokenSvc = require("../../../shared/services/tokenService");
const db       = require("../../../shared/db/mysql");
const logger   = require("../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../shared/utils/response");

const otpCtrl   = require("../controllers/auth/otp.controller");
const tokenCtrl = require("../controllers/auth/token.controller");
const fcmCtrl   = require("../controllers/auth/fcm.controller");
const sessionCtrl   = require("../controllers/auth/session.controller");

const IS_DEV = process.env.NODE_ENV === "development";

// ─── Public ───────────────────────────────────────────────────────────────────
router.post("/send-otp",   otpLimiter,  otpCtrl.sendOtp);
router.post("/verify-otp", authLimiter, otpCtrl.verifyOtp);
router.post("/refresh",                 tokenCtrl.refresh);

// ─── Protected ────────────────────────────────────────────────────────────────
router.post  ("/fcm", auth(), fcmCtrl.saveFcmToken);
router.delete("/fcm", auth(), fcmCtrl.deleteFcmToken);

router.post("/validate-token", tokenCtrl.validateToken);

router.get("/isregistered", sessionCtrl.isRegistered);
router.post("/should-show-welcome", sessionCtrl.shouldShowWelcome);
router.post("/mark-welcome-seen", sessionCtrl.markWelcomeSeen);
router.post("/select-student", auth(), sessionCtrl.selectStudent);
router.get("/get-students-current-mobile", auth(), sessionCtrl.getStudentsForCurrentMobile);

// router.get('/check-version', sessionCtrl.checkAppVersion);

// POST /auth/logout
router.post("/logout", auth(), async (req, res) => {
  try {
    const studId   = req.user.user_id;
    const rawToken = req.cookies?.refresh_token || req.body?.refresh_token;

    if (!IS_DEV) {
      if (rawToken) await tokenSvc.revokeRefreshToken(rawToken);

      // Only the student's own row — fcm_id_record is shared with employees.
      await db.query(
          `DELETE FROM notification_portal.fcm_id_record
           WHERE stud_id = ? AND panel = 'STUD'`,
          [studId]
      );
    }

    res.clearCookie("refresh_token", { path: "/auth" });
    logger.info(`[Auth:student] Logout → stud_id=${studId}`);
    return sendSuccess(res, null, "Logged out successfully");
  } catch (err) {
    logger.error(`[Auth:student] Logout error: ${err.message}`);
    return sendError(res, "Logout failed", 500);
  }
});

// GET /auth/me
router.get("/me", auth(), (req, res) => {
  return sendSuccess(res, req.user, "Authenticated user");
});

module.exports = router;