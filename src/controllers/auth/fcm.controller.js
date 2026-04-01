/**
 * emp/src/controllers/auth/fcm.controller.js
 * ────────────────────────────────────────────
 * Save FCM token after login, delete on logout.
 *
 * POST /api/emp/auth/fcm        → save/update token (protected)
 * DELETE /api/emp/auth/fcm      → delete token on logout (protected)
 */

const db     = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

// ─── POST /auth/fcm ───────────────────────────────────────────────────────────
async function saveFcmToken(req, res) {
    const { fcm_token, app_version } = req.body;
    const emp_id = req.user.user_id;

    if (!fcm_token) {
        return sendError(res, "FCM token is required", 400);
    }

    const deviceInfo = req.headers["user-agent"] || null;

    try {
        // Upsert — one token per employee
        await db.query(
            `INSERT INTO notification_portal.fcm_id_record(emp_id, fcm_id, device_type, app_version)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         fcm_id     = VALUES(fcm_id),
         device_type = VALUES(device_type),
         app_version = VALUES(app_version),
         updated_at  = NOW()`,
            [emp_id, fcm_token, deviceInfo, app_version || null]
        );

        logger.debug(`[FCM:emp] Token saved for emp_id=${emp_id}`);
        return sendSuccess(res, null, "FCM token saved");
    } catch (err) {
        logger.error(`[FCM:emp] Save error for emp_id=${emp_id}: ${err.message}`);
        return sendError(res, "Failed to save FCM token", 500);
    }
}

// ─── DELETE /auth/fcm ─────────────────────────────────────────────────────────
async function deleteFcmToken(req, res) {
    const emp_id = req.user.user_id;

    try {
        await db.query(
            `DELETE FROM notification_portal.fcm_id_record WHERE emp_id = ?`,
            [emp_id]
        );

        logger.debug(`[FCM:emp] Token deleted for emp_id=${emp_id}`);
        return sendSuccess(res, null, "FCM token removed");
    } catch (err) {
        logger.error(`[FCM:emp] Delete error for emp_id=${emp_id}: ${err.message}`);
        return sendError(res, "Failed to remove FCM token", 500);
    }
}

module.exports = { saveFcmToken, deleteFcmToken };