/**
 * student/src/middlewares/errorNotifier.js
 * ─────────────────────────────────────────
 * Reports failed requests (status >= 400, except 401 and 404) to the Error
 * Notification service, which stores them and pushes an FCM alert.
 * Only active when NODE_ENV=production.
 *
 * Usage in server.js:
 *   app.use(errorNotifier);   // before routes
 *   ...routes, notFound...
 *   app.use(captureError);    // just before errorHandler
 *   app.use(errorHandler);
 */

const axios  = require("axios");
const logger = require("../../../shared/utils/logger");

const ERROR_LOG_URL = "https://myrungta.com/error_notification/log_error.php";
const IS_PROD       = process.env.NODE_ENV === "production";
const SOURCE        = "STUDENT APP";

/**
 * Send one error to the Error Notification service. Never throws.
 */
async function logError(error, options = {}) {
  if (!IS_PROD) return;

  try {
    await axios.post(
      ERROR_LOG_URL,
      {
        source:      options.source     ?? SOURCE,
        status_code: options.statusCode ?? error.status ?? error.statusCode ?? 500,
        message:     error.message      ?? String(error),
        stack_trace: error.stack        ?? "",
        endpoint:    options.endpoint   ?? "",
        environment: options.emp_id     ?? "production",
      },
      { timeout: 5000 }
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
