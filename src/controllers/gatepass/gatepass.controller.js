const crypto = require("crypto");
const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const { notify } = require("../../../../shared/services/notificationService");

// Student gate pass. Lives in the employees' early_leave_request table
// (user_type = 'student') so the guard scans both with the same emp-app
// endpoint — POST /leave/early-leave/verify-qr — and both show up in the same
// gate history. There is deliberately no scan endpoint in this app.
//
// Student rows differ from employee rows:
//   emp_id      = 0           (never matches an employee, so employee lists skip them)
//   stud_id     = student id
//   date        = first valid day,  to_date = last valid day
//   out_time    = '00:00'     (employees pick a time; students don't)
//   request_type= 'Personal'  (unused — user_type is what identifies the row)
//   hod_status  = 'Pending'   until a warden (emp app, designation 634 / 648)
//                             approves or rejects it; hod_id / hod_remark hold
//                             who decided and why. QR only once Approved.
//   hoi/hr      = 'Pending'   (unused for students)
//   will_return = 1           (one pass = scan out, then scan back in)

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86400000;
const MAX_PASS_DAYS = 30;
// Keep in step with the app's limits in app/(dashboard)/gate-pass.tsx.
const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 300;
// Warden designations — keep in step with STUDENT_GATE_PASS_APPROVER_DES_IDS
// in the emp app's earlyLeave.controller.js.
const WARDEN_DES_IDS = [634, 648];
// Must match the emp app's EARLY_LEAVE_QR_TTL_MIN — that's where it is enforced.
const QR_TTL_SEC = parseInt(process.env.EARLY_LEAVE_QR_TTL_MIN || "10", 10) * 60;

// Front gate location — same env vars as the emp app, so set them in this
// app's .env too. The QR can only be generated near the gate.
const GATE_LAT = parseFloat(process.env.FRONT_GATE_LAT);
const GATE_LNG = parseFloat(process.env.FRONT_GATE_LNG);
const GATE_RADIUS_METERS = parseInt(process.env.FRONT_GATE_RADIUS_METERS || "150", 10);

function distanceInMeters(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// "2026-10-10 14:05:09" in IST — the table stores IST wall-clock time.
const nowIST = () => new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" });

const isRealDate = (s) => {
    if (!DATE_RE.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

// Inclusive: same day → 1.
const dayCount = (from, to) =>
    Math.round((new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / DAY_MS) + 1;

// Times are stored in IST; the offset lets the app parse them unambiguously.
const IST_ISO = "'%Y-%m-%dT%H:%i:%s+05:30'";
const PASS_COLUMNS = `
    id,
    DATE_FORMAT(date, '%Y-%m-%d') AS from_date,
    DATE_FORMAT(COALESCE(to_date, date), '%Y-%m-%d') AS to_date,
    reason,
    hod_status,
    hod_remark,
    DATE_FORMAT(created_on, ${IST_ISO}) AS created_at,
    DATE_FORMAT(gate_out_time, ${IST_ISO}) AS gate_out_time,
    DATE_FORMAT(gate_in_time, ${IST_ISO}) AS gate_in_time`;

// "pending" until a warden approves it (or "rejected"), then "active" until
// scanned out, "out" until scanned back in. A pass that has been scanned in is
// finished and no longer returned.
function passStatus(row) {
    if (row.gate_out_time) return "out";
    if (row.hod_status === "Rejected") return "rejected";
    if (row.hod_status !== "Approved") return "pending";
    return "active";
}
const formatPass = ({ hod_status, hod_remark, ...row }) => ({
    ...row,
    status: passStatus({ ...row, hod_status }),
    remark: hod_remark || null,
});

// Enabled employees holding a warden designation (main or add-on) in their own college.
async function getWardenEmpIds() {
    const [rows] = await db.query(
        `SELECT em.emp_id
         FROM employee_master em
         JOIN designation_master_change d
           ON d.college_id = em.emp_clg_id
          AND d.des_id IN (em.emp_designation_id, em.emp_addon_designation_id)
         WHERE em.enable_status = '1' AND d.des_id IN (?)
         GROUP BY em.emp_id`,
        [WARDEN_DES_IDS]
    );
    return rows.map((r) => r.emp_id);
}

// The student's current pass: not cancelled, not finished, not past its last day.
async function findActivePass(studentId, todayIST) {
    const [rows] = await db.query(
        `SELECT ${PASS_COLUMNS}
         FROM early_leave_request
         WHERE user_type = 'student' AND stud_id = ?
           AND cancelled_on IS NULL
           AND gate_in_time IS NULL
           AND COALESCE(to_date, date) >= ?
         ORDER BY id DESC
         LIMIT 1`,
        [studentId, todayIST]
    );
    return rows[0] ? formatPass(rows[0]) : null;
}

// ─── GET /gate-pass/active ────────────────────────────────────────────────────
async function getActiveGatePass(req, res) {
    try {
        // Student id comes only from the verified token, never from the request.
        const studentId = req.user.user_id;
        const pass = await findActivePass(studentId, nowIST().slice(0, 10));

        return sendSuccess(res, { pass }, pass ? "Active gate pass fetched" : "No active gate pass");

    } catch (err) {
        logger.error(`[GatePass] getActiveGatePass error: ${err.message}`);
        return sendError(res, "Unable to fetch gate pass", 500);
    }
}

// ─── POST /gate-pass ──────────────────────────────────────────────────────────
// Body: { from_date, to_date, reason }  dates "YYYY-MM-DD"
// Requests a pass (pending warden approval) and replaces a pass that hasn't
// been used yet.
async function generateGatePass(req, res) {
    try {
        const studentId = req.user.user_id;

        const fromDate = String(req.body.from_date || "").trim();
        const toDate = String(req.body.to_date || "").trim();
        const reason = String(req.body.reason || "").trim();

        if (!isRealDate(fromDate) || !isRealDate(toDate)) {
            return sendError(res, "Dates must be in YYYY-MM-DD format", 400);
        }
        if (reason.length < MIN_REASON_LENGTH) {
            return sendError(res, `Reason must be at least ${MIN_REASON_LENGTH} characters long`, 400);
        }
        if (reason.length > MAX_REASON_LENGTH) {
            return sendError(res, `Reason cannot exceed ${MAX_REASON_LENGTH} characters`, 400);
        }

        const createdOn = nowIST();
        const todayIST = createdOn.slice(0, 10);

        if (fromDate < todayIST) {
            return sendError(res, "From date cannot be in the past", 400);
        }
        if (toDate < fromDate) {
            return sendError(res, "To date cannot be before from date", 400);
        }
        if (dayCount(fromDate, toDate) > MAX_PASS_DAYS) {
            return sendError(res, `A gate pass can cover at most ${MAX_PASS_DAYS} days`, 400);
        }

        // Only students with an active hostel allotment get a gate pass —
        // same rule as the web portal and the dashboard's gatePassVisible.
        const [allotment] = await db.query(
            `SELECT bed_id
             FROM hostel_allotment_log
             WHERE stud_id = ? AND allotment_status = '1'
             LIMIT 1`,
            [studentId]
        );

        if (allotment.length === 0) {
            return sendError(res, "Gate pass is available only for hostel students", 403);
        }

        // A student who has scanned out must scan back in on that pass first.
        const current = await findActivePass(studentId, todayIST);
        if (current?.status === "out") {
            return sendError(res, "You are currently out on a gate pass. Scan in at the gate before requesting a new one", 409);
        }

        // An unused pass is replaced: its QR stops working.
        await db.query(
            `UPDATE early_leave_request
             SET cancelled_on = ?, qr_code = NULL
             WHERE user_type = 'student' AND stud_id = ?
               AND cancelled_on IS NULL AND gate_out_time IS NULL`,
            [createdOn, studentId]
        );

        const [result] = await db.query(
            `INSERT INTO early_leave_request
             (user_type, stud_id, emp_id, date, to_date, out_time, return_time, will_return, reason, request_type,
              hod_status, hoi_status, hr_status, created_on)
             VALUES ('student', ?, 0, ?, ?, '00:00', NULL, 1, ?, 'Personal', 'Pending', 'Pending', 'Pending', ?)`,
            [studentId, fromDate, toDate, reason, createdOn]
        );

        logger.info(`[GatePass] Requested → stud_id=${studentId}, id=${result.insertId}`);

        getWardenEmpIds()
            .then((wardenIds) => wardenIds.length && notify({
                userIds: wardenIds,
                title: "Student Gate Pass Request",
                body: `A student has requested a gate pass for ${fromDate === toDate ? fromDate : `${fromDate} to ${toDate}`}.`,
                sentBy: studentId,
                data: { screen: "EarlyLeaveApprovals", event_id: String(result.insertId) },
                logTag: "GatePass",
            }))
            .catch((e) => logger.warn(`[GatePass] Warden notification failed: ${e.message}`));

        const pass = await findActivePass(studentId, todayIST);

        return sendSuccess(res, { pass }, "Gate pass requested. You can use it once the warden approves it");

    } catch (err) {
        logger.error(`[GatePass] generateGatePass error: ${err.message}`);
        return sendError(res, "Unable to generate gate pass. Please try again.", 500);
    }
}

// ─── POST /gate-pass/:id/qr ───────────────────────────────────────────────────
// Body: { latitude, longitude }
// Short-lived code for the guard to scan, same scheme as the employees' gate
// QR: location-gated to the front gate, random, stored on the row, cleared by
// the scan, expires after QR_TTL_SEC.
async function generateGateQr(req, res) {
    try {
        const studentId = req.user.user_id;
        const id = req.params.id;
        const { latitude, longitude } = req.body;

        if (latitude === undefined || longitude === undefined) {
            return sendError(res, "latitude and longitude are required", 400);
        }
        if (Number.isNaN(GATE_LAT) || Number.isNaN(GATE_LNG)) {
            logger.error("[GatePass] FRONT_GATE_LAT/FRONT_GATE_LNG not configured");
            return sendError(res, "Gate location not configured — contact admin", 500);
        }

        const lat = parseFloat(latitude);
        const lng = parseFloat(longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            return sendError(res, "latitude and longitude must be valid numbers", 400);
        }

        const distance = distanceInMeters(lat, lng, GATE_LAT, GATE_LNG);
        if (distance > GATE_RADIUS_METERS) {
            return sendError(
                res,
                `You must be near the front gate to generate this QR (you're ~${Math.round(distance)}m away)`,
                403
            );
        }

        const generatedOn = nowIST();
        const todayIST = generatedOn.slice(0, 10);

        const [[row]] = await db.query(
            `SELECT id,
                    DATE_FORMAT(date, '%Y-%m-%d') AS from_date,
                    DATE_FORMAT(COALESCE(to_date, date), '%Y-%m-%d') AS to_date,
                    cancelled_on, gate_in_time, hod_status
             FROM early_leave_request
             WHERE id = ? AND user_type = 'student' AND stud_id = ?
             LIMIT 1`,
            [id, studentId]
        );

        if (!row) return sendError(res, "Gate pass not found", 404);
        if (row.cancelled_on) return sendError(res, "This gate pass was replaced by a newer one", 400);
        if (row.gate_in_time) return sendError(res, "This gate pass has already been used", 400);
        if (row.hod_status === "Rejected") return sendError(res, "This gate pass was rejected by the warden", 403);
        if (row.hod_status !== "Approved") return sendError(res, "This gate pass is awaiting warden approval", 403);
        if (todayIST < row.from_date) {
            return sendError(res, `This gate pass is valid from ${row.from_date}`, 403);
        }
        if (todayIST > row.to_date) {
            return sendError(res, "This gate pass has expired", 400);
        }

        const qrCode = crypto.randomBytes(16).toString("hex");

        await db.query(
            `UPDATE early_leave_request SET qr_code = ?, qr_generated_on = ? WHERE id = ?`,
            [qrCode, generatedOn, row.id]
        );

        return sendSuccess(res, { qr_code: qrCode, expires_in_sec: QR_TTL_SEC }, "Gate QR generated");

    } catch (err) {
        logger.error(`[GatePass] generateGateQr error: ${err.message}`);
        return sendError(res, "Unable to generate gate QR. Please try again.", 500);
    }
}

module.exports = { getActiveGatePass, generateGatePass, generateGateQr };
