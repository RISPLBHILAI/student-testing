const db       = require("../../../../shared/db/mysql");
const jwt = require("jsonwebtoken");
const otpSvc   = require("../../../../shared/services/otpService");
const tokenSvc = require("../../../../shared/services/tokenService");
const logger   = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

const IS_DEV = process.env.NODE_ENV === "development";

async function refresh(req, res) {
    try {
        const rawToken = req.cookies?.refresh_token || req.body?.refresh_token;

        if (!rawToken) {
            return sendError(res, "Refresh token missing", 401);
        }

        // ── DEV: refresh tokens aren't persisted in dev (see otp.controller),
        //    so just issue a new student access token ──────────────────────────
        if (IS_DEV) {
            const accessToken = tokenSvc.generateAccessToken({
                user_id: parseInt(process.env.DEV_USER_ID || "1"),
                name:    process.env.DEV_USER_NAME         || "Dev Student",
                mobile:  "0000000000",
                role:    "student",
                app:     "student",
            });
            return sendSuccess(res, {
                access_token: accessToken,
                expires_in:   900,
                _dev:         true,
            }, "Token refreshed");
        }

        // ── PRODUCTION: verify + rotate ───────────────────────────────────────
        const { newRawToken, userId } = await tokenSvc.verifyAndRotateRefreshToken({
            rawToken,
            app:       "student",
            ip:        req.ip,
            userAgent: req.headers["user-agent"],
        });

        // Fetch fresh student data (status may have changed since login)
        const [rows] = await db.query(
            `SELECT
                 id          AS user_id,
                 stud_name   AS name,
                 stud_mobile AS mobile,
                 current_status
             FROM tblstud_profile
             WHERE id = ?
             LIMIT 1`,
            [userId]
        );

        if (!rows.length) {
            await tokenSvc.revokeAllUserTokens(userId, "student");
            return sendError(res, "Student not found", 401);
        }

        const stud = rows[0];

        // Same eligibility rule as login (findStudentByMobile)
        if (!["regular", "x_regular"].includes(stud.current_status)) {
            await tokenSvc.revokeAllUserTokens(userId, "student");
            return sendError(res, "Your account is no longer active — please contact the college", 403);
        }

        // Same payload shape as the OTP login
        const accessToken = tokenSvc.generateAccessToken({
            user_id: stud.user_id,
            name:    stud.name,
            mobile:  stud.mobile,
            // Same as login. Admin access is the separate isAdmin token, never a role here.
            role:    otpSvc.isBypassMobile(stud.mobile) ? "DummyUser" : "student",
            app:     "student",
        });

        // Set new refresh token in httpOnly cookie
        res.cookie("refresh_token", newRawToken, {
            httpOnly: true,
            secure:   true,
            sameSite: "strict",
            maxAge:   30 * 24 * 60 * 60 * 1000,
            path:     "/auth",
        });

        logger.debug(`[Token:student] Refreshed for stud_id=${stud.user_id}`);

        return sendSuccess(res, {
            access_token:  accessToken,
            refresh_token: newRawToken, // also in body for React Native
            expires_in:    900,
        }, "Token refreshed");

    } catch (err) {
        if (err.statusCode) {
            return sendError(res, err.message, err.statusCode);
        }
        logger.error(`[Token:student] Refresh error: ${err.message}`);
        return sendError(res, "Token refresh failed", 500);
    }
}

// ─── POST /auth/validate-token ────────────────────────────────────────────────
// Called by the app's splash screen on every start. A missing/expired/invalid
// access token returns 401 (not 200 { valid: false }) so the app's global 401
// handler refreshes with the refresh token and retries — otherwise every app
// open after the 15m access-token lifetime would log the student out.
async function validateToken(req, res) {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ valid: false });
    }

    try {
        // Same issuer check as every other token verification
        jwt.verify(token, process.env.JWT_SECRET, { issuer: "srgi-api" });
        return res.status(200).json({ valid: true });
    } catch (err) {
        return res.status(401).json({ valid: false });
    }
}

module.exports = { refresh, validateToken };