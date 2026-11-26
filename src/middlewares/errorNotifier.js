/**
 * student/src/middlewares/errorNotifier.js
 * ─────────────────────────────────────────
 * Captures failed requests (status >= 400, except 401 and 404) and logs them
 * locally via the shared logger. No external API calls are made.
 * Only active when NODE_ENV=production.
 *
 * Usage in server.js:
 *   app.use(errorNotifier);   // before routes
 *   ...routes, notFound...
 *   app.use(captureError);    // just before errorHandler
 *   app.use(errorHandler);
 */

const logger = require("../../../shared/utils/logger");

const IS_PROD = process.env.NODE_ENV === "production";
const SOURCE  = "STUDENT APP";

/**
 * Log one error locally. Never throws.
 */
async function logError(error, options = {}) {
  if (!IS_PROD) return;

  try {
    const source     = options.source     ?? SOURCE;
    const statusCode = options.statusCode ?? error.status ?? error.statusCode ?? 500;
    const message    = error.message      ?? String(error);
    const endpoint   = options.endpoint   ?? "";
    const user       = options.emp_id     ?? "";

    logger.error(
      `[ErrorNotifier] ${source} | ${statusCode} | ${endpoint}${user ? ` | ${user}` : ""} | ${message}` +
      (error.stack ? `\n${error.stack}` : "")
    );
  } catch (e) {
    logger.warn(`[ErrorNotifier] Failed to log error: ${e.message}`);
  }
}

/**
 * Hooks every response and reports it once finished if it failed.
 */
function errorNotifier(req, res, next) {
  if (!IS_PROD) return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    res.locals.responseBody = body;
    return originalJson(body);
  };

  res.on("finish", () => {
    const statusCode = res.statusCode;
    if (statusCode < 400 || statusCode === 401 || statusCode === 404) return;

    const body = res.locals.responseBody;
    const err  = res.locals.error || new Error(body?.message || body?.error || `HTTP ${statusCode} error`);
    if (!res.locals.error) err.stack = "";

    const studentId = req.user?.user_id ?? req.user?.mobile;
    logError(err, {
      source:     `${SOURCE} / ${req.ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress}`,
      statusCode,
      endpoint:   `${req.method} ${req.originalUrl}`,
      ...(studentId && { emp_id: `Student ID: ${studentId}` }),
    });
  });

  next();
}

/**
 * Error middleware that stores the real error (message + stack) for
 * errorNotifier, then passes it on unchanged to errorHandler.
 */
function captureError(err, req, res, next) {
  res.locals.error = err;
  next(err);
}

module.exports = { logError, errorNotifier, captureError };