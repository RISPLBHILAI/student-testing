const crypto = require("crypto");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

// Shared with create_handoff.php — never send this to the app.
const EVENT_HANDOFF_SHARED_SECRET =
    "c771058f770ad9e2c30d31bf9ca3bc3993febbb9c3363145ba2e799bfa3a1783";

// create_handoff.php signs/verifies against its own fixed event id, so this
// must match it. The URL doesn't carry the event id.
const EVENT_ID = 1;

const CREATE_HANDOFF_URL =
    "https://myrungta.com/erp/StudentPanel/events/create_event_handoff.php";

// ─── GET /event/handoff-url ───────────────────────────────────────────────────
// Returns a short-lived signed URL that logs the student into the PHP events
// portal. create_handoff.php verifies the HMAC and the one-time nonce.
async function handoffUrl(req, res) {
    // Student id comes only from the verified token, never from the request.
    const studId = Number(req.user?.user_id || 0);

    if (!studId) {
        return sendError(res, "Unauthorized", 401);
    }

    try {
        const ts = Math.floor(Date.now() / 1000);
        console.log(ts);
        const nonce = crypto.randomBytes(16).toString("hex");

        const sig = crypto
            .createHmac("sha256", EVENT_HANDOFF_SHARED_SECRET)
            .update(`${studId}|${EVENT_ID}|${ts}|${nonce}`)
            .digest("hex");

        const params = new URLSearchParams({
            s: String(studId),
            ts: String(ts),
            n: nonce,
            sig,
        });

        logger.debug(`[Event:student] Handoff URL issued → stud_id=${studId}`);

        return sendSuccess(res, {
            url: `${CREATE_HANDOFF_URL}?${params.toString()}`,
            expires_in: 90,
        }, "Event handoff URL generated");

    } catch (err) {
        logger.error(`[Event:student] handoffUrl error: ${err.message}`);
        return sendError(res, "Unable to open event", 500);
    }
}

module.exports = { handoffUrl };
