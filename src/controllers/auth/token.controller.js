const db       = require("../../../../shared/db/mysql");
const jwt = require("jsonwebtoken");
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

        // ── DEV: skip DB, just issue new access token ─────────────────────────
        if (IS_DEV) {
            const accessToken = tokenSvc.generateAccessToken({
                user_id: parseInt(process.env.DEV_USER_ID || "1"),
                name:    process.env.DEV_USER_NAME         || "Dev Admin",
                mobile:  "0000000000",
                role:    "Employee",
                app:     "emp",
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
            app:       "emp",
            ip:        req.ip,
            userAgent: req.headers["user-agent"],
        });

        // Fetch fresh employee data (role/status may have changed)
        const [rows] = await db.query(
            `SELECT
                 emp_id    AS user_id,
                 emp_name  AS name,
                 emp_mono  AS mobile,
                 enable_status,
                 erp_login_status
             FROM employee_master
             WHERE emp_id = ?
                 LIMIT 1`,
            [userId]
        );

        if (!rows.length) {
            return sendError(res, "Employee not found", 401);
        }

        const emp = rows[0];

        // Check account is still active
        if (emp.enable_status !== "1" || emp.erp_login_status !== "1") {
            // Revoke all tokens — account deactivated
            await tokenSvc.revokeAllUserTokens(userId, "emp");
            return sendError(res, "Account has been deactivated — please contact HR", 403);
        }

        const accessToken = tokenSvc.generateAccessToken({
            user_id: emp.user_id,
            name:    emp.name,
            mobile:  emp.mobile,
            role:    "Employee",
            app:     "emp",
        });

        // Set new refresh token in httpOnly cookie
        res.cookie("refresh_token", newRawToken, {
            httpOnly: true,
            secure:   true,
            sameSite: "strict",
            maxAge:   30 * 24 * 60 * 60 * 1000,
            path:     "/auth",
        });

        logger.debug(`[Token:emp] Refreshed for emp_id=${emp.user_id}`);

        return sendSuccess(res, {
            access_token:  accessToken,
            refresh_token: newRawToken, // also in body for React Native
            expires_in:    900,
        }, "Token refreshed");

    } catch (err) {
        if (err.statusCode) {
            return sendError(res, err.message, err.statusCode);
        }
        logger.error(`[Token:emp] Refresh error: ${err.message}`);
        return sendError(res, "Token refresh failed", 500);
    }
}

async function validateToken(req, res) {
      try {
            // Read token from Authorization header
            const authHeader = req.headers.authorization;

            if (!authHeader) {
                return res.status(200).json({ valid: false });
            }

            const token = authHeader.split(" ")[1];

            // Verify token
            jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(200).json({ valid: false });
                }

                // Token is valid
                return res.status(200).json({
                    valid: true,
                    // token: authHeader
                    // user: decoded,
                });
            });

        } catch (error) {
            return res.status(500).json({
                valid: false,
                error: "Internal server error"
            });
        }
}

module.exports = { refresh, validateToken };