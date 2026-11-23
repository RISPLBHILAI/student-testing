/**
 * student/src/controllers/auth/fcm.controller.js
 * ────────────────────────────────────────────
 * Save FCM token after login, delete on logout.
 *
 * POST /api/student/auth/fcm        → save/update token (protected)
 * DELETE /api/student/auth/fcm      → delete token on logout (protected)
 */

const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

// Only Expo push tokens are valid (same rule as the EMP app). A raw native
// device token (64-char APNs hex on iOS, "xxx:APA91b..." FCM on Android) would
// overwrite the good Expo token and silently stop notifications.
const EXPO_PUSH_TOKEN_RE = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;

// ─── POST /auth/fcm ───────────────────────────────────────────────────────────
async function saveFcmToken(req, res) {
    // New builds send `fcm_token` (same as EMP); older builds send `token`
    const raw = req.body.fcm_token ?? req.body.token;
    const token = typeof raw === "string" ? raw.trim() : "";
    const { deviceType, app_version } = req.body;

    const stud_id = req.user.user_id;

    // Admin's device must never replace the real student's push token
    if (req.user.impersonation) {
        return sendSuccess(res, null, "Skipped during impersonation");
    }

    if (!token) {
        return sendError(res, "FCM token is required", 400);
    }

    // Reject non-Expo tokens WITHOUT touching the stored value.
    // Must be 422 (not 401) — a 401 makes the app attempt a refresh / force logout.
    if (!EXPO_PUSH_TOKEN_RE.test(token)) {
        logger.warn(
            `[FCM:student] Rejected non-Expo token for stud_id=${stud_id} ` +
            `(len=${token.length}, device=${deviceType || "-"}, app_version=${app_version || "-"})`
        );
        return sendError(res, "Invalid push token format", 422);
    }

    try {

        // -----------------------------
        // CHECK EXISTING ENTRY
        // -----------------------------

        const [rows] = await db.query(
            `
            SELECT id
            FROM notification_portal.fcm_id_record
            WHERE stud_id = ?
              AND panel = 'STUD'
            LIMIT 1
            `,
            [stud_id]
        );

        // -----------------------------
        // INSERT
        // -----------------------------

        if (rows.length === 0) {

            await db.query(
                `
                INSERT INTO notification_portal.fcm_id_record (
                    panel,
                    expo_push_token,
                    push_provider,
                    user_type,
                    stud_id,
                    device_type,
                    app_version,
                    created_on,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
                `,
                [
                    'STUD',
                    token,
                    'EXPO',
                    'student',
                    stud_id,
                    deviceType,
                    app_version || null
                ]
            );

            logger.debug(`[FCM] New token inserted for stud_id=${stud_id}`);

        }

        // -----------------------------
        // UPDATE
        // -----------------------------

        else {

            await db.query(
                `
                UPDATE notification_portal.fcm_id_record
                SET
                    expo_push_token = ?,
                    device_type = ?,
                    app_version = ?,
                    push_provider = 'EXPO',
                    updated_at = NOW()
                WHERE
                    stud_id = ?
                    AND panel = 'STUD'
                `,
                [
                    token,
                    deviceType,
                    app_version || null,
                    stud_id
                ]
            );

            logger.debug(`[FCM] Existing token updated for stud_id=${stud_id}`);
        }

        return sendSuccess(res, null, "FCM token saved");

    } catch (err) {

        logger.error(
            `[FCM] Save error for stud_id=${stud_id}: ${err.message}`
        );

        return sendError(res, "Failed to save FCM token", 500);
    }
}
// ─── DELETE /auth/fcm ─────────────────────────────────────────────────────────
async function deleteFcmToken(req, res) {
    const stud_id = req.user.user_id;

    if (req.user.impersonation) {
        return sendSuccess(res, null, "Skipped during impersonation");
    }

    try {
        // Only the student's own row — fcm_id_record is shared with employees.
        await db.query(
            `DELETE FROM notification_portal.fcm_id_record
             WHERE stud_id = ?
               AND panel = 'STUD'`,
            [stud_id]
        );

        logger.debug(`[FCM] Token deleted for stud_id=${stud_id}`);
        return sendSuccess(res, null, "FCM token removed");
    } catch (err) {
        logger.error(`[FCM] Delete error for stud_id=${stud_id}: ${err.message}`);
        return sendError(res, "Failed to remove FCM token", 500);
    }
}

module.exports = { saveFcmToken, deleteFcmToken };