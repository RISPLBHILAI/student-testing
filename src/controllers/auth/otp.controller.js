const otpSvc = require("../../../../shared/services/otpService");
const notifSvc = require("../../../../shared/services/notificationService");
const tokenSvc = require("../../../../shared/services/tokenService");
const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const StudentService = require("../../services/student.service");
const config = require("../../config");

const IS_DEV = process.env.NODE_ENV === "development";

// ─── Helper: fetch student by mobile ────────────────────────────────────────
async function findStudentByMobile(mobile) {
    const [rows] = await db.query(
        `SELECT * 
            FROM tblstud_profile
            WHERE stud_mobile = ?
            AND current_status 
            IN ('regular', 'x_regular')`,
        [mobile]
    );
    return rows[0] || null;
}

// ─── POST /auth/send-otp ──────────────────────────────────────────────────────
async function sendOtp(req, res) {
    const { mobile_no } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────────
    if (!mobile_no) {
        return sendError(res, "Mobile number is required", 400);
    }
    if (!/^\d{10}$/.test(mobile_no)) {
        return sendError(res, "Enter a valid 10-digit mobile number", 400);
    }

    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    const userAgent = req.headers["user-agent"] || "";
    const isBypass = otpSvc.isBypassMobile(mobile_no);

    try {
        // ── Bypass mobiles: skip OTP sending ─────────────────────────────────────
        if (isBypass) {
            logger.debug(`[OTP:student] Bypass mobile ${mobile_no} — skipping send`);
            return sendSuccess(res, null, "OTP sent successfully");
        }
        // ── Check student exists ────────────────────────────────────────────────
        const student = await findStudentByMobile(mobile_no);
        if (!student) {
            return sendError(res, "Mobile number not registered or account inactive", 404);
        }


        // ── Generate and store OTP ───────────────────────────────────────────────
        const otp = await otpSvc.createAndStore(mobile_no, ip, userAgent, "student");

        // ── In dev: log OTP, skip real sending ───────────────────────────────────
        if (IS_DEV) {
            logger.debug(`[OTP:student] DEV mode — OTP for ${mobile_no} is ${otp}`);
            return sendSuccess(res, null, "OTP sent successfully");
        }

        // ── Send OTP via WhatsApp (primary) + SMS (fallback) ─────────────────────
        const results = await Promise.allSettled([
            notifSvc.sendWhatsApp(mobile_no, otp),
            notifSvc.sendSMS(mobile_no, otp),
        ]);

        console.log(results);

        const whatsappOk = results[0].status === "fulfilled";
        const smsOk = results[1].status === "fulfilled";

        if (!whatsappOk) {
            logger.warn(`[OTP:student] WhatsApp failed for ${mobile_no}: ${results[0].reason?.message}`);
        }
        if (!smsOk) {
            logger.warn(`[OTP:student] SMS failed for ${mobile_no}: ${results[1].reason?.message}`);
        }

        // If both fail, don't tell the user the OTP — return error
        if (!whatsappOk && !smsOk) {
            return sendError(res, "Failed to send OTP — please try again", 500);
        }

        return sendSuccess(res, null, "OTP sent successfully");
    } catch (err) {
        logger.error(`[OTP:student] sendOtp error: ${err.message}`);
        return sendError(res, "Failed to send OTP", 500);
    }
}

// ─── POST /auth/verify-otp ────────────────────────────────────────────────────
async function verifyOtp(req, res) {
    const { mobile_no, otp } = req.body;

    // ── Validation ──────────────────────────────────────────────────────────────
    if (!mobile_no || !otp) {
        return sendError(res, "Mobile number and OTP are required", 400);
    }
    if (!/^\d{10}$/.test(mobile_no)) {
        return sendError(res, "Enter a valid 10-digit mobile number", 400);
    }
    if (!/^\d{6}$/.test(otp)) {
        return sendError(res, "Enter a valid 6-digit OTP", 400);
    }

    const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

    try {
        // ── Verify OTP ───────────────────────────────────────────────────────────
        const { valid, reason } = await otpSvc.verify(mobile_no, otp);
        if (!valid) {
            return sendError(res, reason || "Invalid or expired OTP", 401);
        }

        // ── Check for admin ──────────────────────────────────────────────────────
        const isAdmin = mobile_no === config.admin.mobile;

        // ── Admin flow — skip student selection, go straight to impersonation ────
        if (isAdmin) {
            const adminToken = tokenSvc.generateAccessToken({
                mobile: mobile_no,
                verified: true,
                isAdmin: true,
                tempAccess: true,
                app: "student",
            });

            logger.info(`[OTP:student] Admin login → mobile=${mobile_no}`);

            return sendSuccess(res, {
                tempToken: adminToken,
                mobile: mobile_no,
                isAdmin: true,
                requiresStudentSelection: true,
            }, "OTP verified successfully");
        }

        // ── Fetch student(s) by mobile ───────────────────────────────────────────
        const studentRecords = await StudentService.checkStudent(mobile_no);
        const hasStudents = studentRecords && studentRecords.length > 0;

        // ── Clear used OTP ───────────────────────────────────────────────────────
        await otpSvc.clearOTP(mobile_no);

        // ── No students found — needs registration ───────────────────────────────
        if (!hasStudents) {
            const tempToken = tokenSvc.generateAccessToken({
                mobile: mobile_no,
                verified: true,
                studentCount: 0,
                tempAccess: true,
                app: "student",
            });

            logger.info(`[OTP:student] No student found → mobile=${mobile_no}`);

            return sendSuccess(res, {
                tempToken,
                mobile: mobile_no,
                studentCount: 0,
                students: [],
                multipleStudents: false,
                needsStudentSelection: false,
                needsRegistration: true,
                isAdmin: false,
            }, "OTP verified successfully");
        }

        // ── Multiple / single student flow ───────────────────────────────────────
        const students = studentRecords.map(dbStudent => ({
            id: dbStudent.id,
            name: dbStudent.stud_name,
            profile: dbStudent.stud_profile_pic,
            rollNumber: dbStudent.stud_roll_no,
            course: dbStudent.course || dbStudent.admis_on_cor_id || 'B.Tech',
            year: dbStudent.year || dbStudent.admis_on_sem_year_id || '3rd Year',
            enrollNumber: dbStudent.stud_enroll_no,
            esslid: dbStudent.essl_id,
            mobile: mobile_no,
            registered: true,
        }));

        // ── If only one student, proceed with full login ──────────────────────────
        if (students.length === 1) {
            const student = studentRecords[0];

            // ── Log login ────────────────────────────────────────────────────────────
            // await db.query(
            //     `INSERT INTO employee_login_logs (u_id, login_date_time, verified_otp)
            //      VALUES (?, ?, ?)`,
            //     [student.emp_id, new Date(), otp]
            // );

            // ── Open app session (for active user tracking) ───────────────────────
            // if (!IS_DEV) {
            //     await db.query(
            //         `INSERT INTO notification_portal.emp_app_sessions (emp_id, login_at, last_seen_at, ip, device_info)
            //  VALUES (?, NOW(), NOW(), ?, ?)`,
            //         [student.emp_id, ip, req.headers["user-agent"] || null]
            //     );
            // }

            const payload = {
                user_id: student.id,
                name: student.stud_name,
                mobile: student.stud_mobile,
                // Bypass mobiles are test/review accounts (e.g. App Store).
                role: otpSvc.isBypassMobile(mobile_no) ? "DummyUser" : "student",
                app: "student",
            };

            const accessToken = tokenSvc.generateAccessToken(payload);
            const { raw, hash } = tokenSvc.generateRefreshToken();

            // In dev skip persisting refresh token to DB
            if (!IS_DEV) {
                await tokenSvc.saveRefreshToken({
                    userId: student.id,
                    app: "student",
                    tokenHash: hash,
                    ip,
                    userAgent: req.headers["user-agent"],
                });
            }

            logger.info(`[OTP:student] Login success → stud_id=${student.id} mobile=${mobile_no}`);

            return sendSuccess(res, {
                access_token: accessToken,
                refresh_token: raw,
                expires_in: 900,
                student: {
                    id: student.id,
                    name: student.stud_name,
                    mobile: student.stud_mobile,
                    role: payload.role,
                },
            }, "Login successful");
        }

        // ── Multiple students — issue temp token for selection ───────────────────
        const tempToken = tokenSvc.generateAccessToken({
            mobile: mobile_no,
            verified: true,
            studentCount: students.length,
            tempAccess: true,
            app: "student",
        });

        logger.info(`[OTP:student] Multiple students (${students.length}) → mobile=${mobile_no}`);

        return sendSuccess(res, {
            tempToken,
            mobile: mobile_no,
            studentCount: students.length,
            students,
            multipleStudents: true,
            needsStudentSelection: true,
            isAdmin: false,
        }, "OTP verified successfully");

    } catch (err) {
        logger.error(`[OTP:student] verifyOtp error: ${err.message}`);
        return sendError(res, "Verification failed", 500);
    }
}

module.exports = { sendOtp, verifyOtp };