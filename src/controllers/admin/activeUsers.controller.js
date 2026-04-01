const db       = require("../../../../shared/db/mysql");
const tokenSvc = require("../../../../shared/services/tokenService");
const logger   = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

// ─── GET /admin/active-users ──────────────────────────────────────────────────
// Employees whose last_seen_at is within the last 5 minutes
async function getRealTimeActive(req, res) {
    try {
        const threshold = parseInt(req.query.minutes || "5");

        const [rows] = await db.query(
            `SELECT
         s.emp_id,
         e.emp_name         AS name,
         e.emp_mono         AS mobile,
         s.last_seen_at,
         s.login_at,
         s.device_info,
         s.app_version,
         s.ip,
         TIMESTAMPDIFF(SECOND, s.last_seen_at, NOW()) AS idle_seconds
       FROM notification_portal.emp_app_sessions s
       JOIN employee_master e ON e.emp_id = s.emp_id
       WHERE s.is_active   = 1
         AND s.last_seen_at >= NOW() - INTERVAL ? MINUTE
       ORDER BY s.last_seen_at DESC`,
            [threshold]
        );

        return sendSuccess(res, {
            online_count: rows.length,
            threshold_minutes: threshold,
            employees: rows,
        }, `${rows.length} employee(s) active in last ${threshold} minutes`);
    } catch (err) {
        logger.error(`[ActiveUsers] getRealTimeActive error: ${err.message}`);
        return sendError(res, "Failed to fetch active users", 500);
    }
}

// ─── GET /admin/active-users/history ─────────────────────────────────────────
// Daily active user counts over a date range
async function getHistory(req, res) {
    try {
        const {
            from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            to   = new Date().toISOString().slice(0, 10),
        } = req.query;

        // Daily active users
        const [daily] = await db.query(
            `SELECT
         DATE(login_at)               AS date,
         COUNT(DISTINCT emp_id)        AS unique_users,
         COUNT(*)                      AS total_sessions
       FROM notification_portal.emp_app_sessions
       WHERE DATE(login_at) BETWEEN ? AND ?
       GROUP BY DATE(login_at)
       ORDER BY date ASC`,
            [from, to]
        );

        // Peak hour breakdown
        const [hourly] = await db.query(
            `SELECT
         HOUR(login_at)               AS hour,
         COUNT(DISTINCT emp_id)        AS unique_users
       FROM notification_portal.emp_app_sessions
       WHERE DATE(login_at) BETWEEN ? AND ?
       GROUP BY HOUR(login_at)
       ORDER BY hour ASC`,
            [from, to]
        );

        // Summary
        const [summary] = await db.query(
            `SELECT
         COUNT(DISTINCT emp_id)   AS total_unique_users,
         COUNT(*)                  AS total_sessions,
         AVG(
           TIMESTAMPDIFF(MINUTE, login_at, IFNULL(logout_at, last_seen_at))
         )                         AS avg_session_minutes
       FROM notification_portal.emp_app_sessions
       WHERE DATE(login_at) BETWEEN ? AND ?`,
            [from, to]
        );

        return sendSuccess(res, {
            range: { from, to },
            summary: summary[0],
            daily,
            hourly,
        }, "Historical data fetched");
    } catch (err) {
        logger.error(`[ActiveUsers] getHistory error: ${err.message}`);
        return sendError(res, "Failed to fetch history", 500);
    }
}

// ─── POST /admin/invalidate-all-tokens ───────────────────────────────────────
// Admin manually triggers force logout of ALL employees
// All refresh tokens revoked → next API call returns 401 → app redirects to login
async function invalidateAllTokens(req, res) {
    try {
        const { reason } = req.body;
        const adminId    = req.user.user_id;

        // Revoke all active refresh tokens for emp app
        const [result] = await db.query(
            `UPDATE refresh_tokens
       SET revoked = 1, revoked_at = NOW()
       WHERE app = 'emp' AND revoked = 0`,
        );

        // Mark all sessions as inactive
        await db.query(
            `UPDATE notification_portal.emp_app_sessions
       SET is_active = 0, logout_at = NOW()
       WHERE is_active = 1`
        );

        logger.warn(
            `[Admin:emp] ALL tokens invalidated by admin emp_id=${adminId} | reason=${reason || "none"} | affected=${result.affectedRows}`
        );

        return sendSuccess(res, {
            revoked_tokens: result.affectedRows,
            reason:         reason || null,
            triggered_by:   adminId,
            timestamp:      new Date().toISOString(),
        }, `${result.affectedRows} token(s) invalidated — all employees will be logged out`);
    } catch (err) {
        logger.error(`[Admin:emp] invalidateAllTokens error: ${err.message}`);
        return sendError(res, "Failed to invalidate tokens", 500);
    }
}

module.exports = { getRealTimeActive, getHistory, invalidateAllTokens };