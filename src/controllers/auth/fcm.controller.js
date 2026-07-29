/**
 * emp/src/controllers/auth/fcm.controller.js
 * ────────────────────────────────────────────
 * Save FCM token after login, delete on logout.
 *
 * POST /api/emp/auth/fcm        → save/update token (protected)
 * DELETE /api/emp/auth/fcm      → delete token on logout (protected)
 */

const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

// ─── POST /auth/fcm ───────────────────────────────────────────────────────────
async function saveFcmToken(req, res) {
    const { token, deviceType } = req.body;

    const stud_id = req.user.user_id;

    if (!token) {
        return sendError(res, "FCM token is required", 400);
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
                    created_on,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                `,
                [
                    'STUD',
                    token,
                    'EXPO',
                    'student',
                    stud_id,
                    deviceType
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
                    push_provider = 'EXPO',
                    updated_at = NOW()
                WHERE
                    stud_id = ?
                    AND panel = 'STUD'
                `,
                [
                    token,
                    deviceType,
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