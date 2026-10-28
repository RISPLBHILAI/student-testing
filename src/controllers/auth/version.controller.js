/**
 * student/src/controllers/auth/version.controller.js
 *
 * GET /auth/check-version?platform=android|ios   (public — runs before login)
 * Same response as the emp app's check-version: latest released version for
 * the platform plus everything the app's update screen shows. The app compares
 * latest_version with its installed version.
 *
 * All of it is edited in the student app's app_version row (APP_ID / APP_NAME below):
 *   app_version                             latest version (both platforms)
 *                                           — falls back to app_version_android / app_version_ios
 *                                             while the single column does not exist yet
 *   min_version                             builds older than this must update, whatever
 *                                           force_update says (optional)
 *   force_update                            1 = compulsory, 0 = user can skip
 *   update_title, update_message            screen heading + text   (optional)
 *   whats_new                               release notes, one per line (optional)
 *   store_url_android / store_url_ios       store listing links     (optional)
 * Optional columns that are NULL or not created yet fall back to the app's defaults.
 */

const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

// The student app's row in app_version (CRM is 1 / 'CRM', EMP is 2 / 'EMP')
const APP_ID = 3;
const APP_NAME = "STUDENT";

// "• Fixed X\n- Added Y" → ["Fixed X", "Added Y"]
const toLines = (text) =>
    String(text || "")
        .split(/\r?\n/)
        .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
        .filter(Boolean);

async function checkVersion(req, res) {
    const ios = req.query.platform === "ios";

    try {
        const [[row]] = await db.query(
            `SELECT * FROM app_version WHERE app_id = ? AND app_name = ? LIMIT 1`,
            [APP_ID, APP_NAME]
        );

        if (!row) return sendError(res, "App version not found", 404);

        return sendSuccess(res, {
            platform: ios ? "ios" : "android",
            latest_version: row.app_version ?? (ios ? row.app_version_ios : row.app_version_android),
            min_version: row.min_version || null,
            force_update: Number(row.force_update) === 1,
            title: row.update_title || null,
            message: row.update_message || null,
            whats_new: toLines(row.whats_new),
            store_url: (ios ? row.store_url_ios : row.store_url_android) || null,
        }, "App version fetched");
    } catch (err) {
        logger.error(`[Auth:student] checkVersion error: ${err.message}`);
        return sendError(res, "Failed to fetch app version", 500);
    }
}

module.exports = { checkVersion };
