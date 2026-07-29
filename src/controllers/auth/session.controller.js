const jwt = require("jsonwebtoken");
const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const tokenSvc = require("../../../../shared/services/tokenService");
const { generateAccessToken } = tokenSvc;

const OTPService = require("../../../../shared/services/otpService");

const IS_DEV = process.env.NODE_ENV === "development";

// ─── Helper: fetch students by mobile ────────────────────────────────────────
async function findStudentsByMobile(mobile) {
    const [rows] = await db.query(
        `SELECT *
         FROM tblstud_profile
         WHERE stud_mobile = ?
         AND current_status IN ('regular', 'x_regular')`,
        [mobile]
    );
    return rows;
}

// ─── GET /auth/isregistered ───────────────────────────────────────────────────
async function isRegistered(req, res) {
    try {
        const mobile = req.query?.mobile || req.user?.mobile || null;

        if (!mobile) {
            return sendError(res, "Mobile number is required", 400);
        }

        const [rows] = await db.query(
            `SELECT id FROM tblstud_profile
             WHERE stud_mobile = ?
             AND current_status IN ('regular', 'x_regular')
             LIMIT 1`,
            [mobile]
        );

        logger.debug(`[App:student] isRegistered → mobile=${mobile} result=${!!rows[0]}`);

        return sendSuccess(res, {
            isRegistered: !!rows[0],
        }, "Registration status fetched");

    } catch (err) {
        logger.error(`[App:student] isRegistered error: ${err.message}`);
        return sendError(res, "Failed to check registration status", 500);
    }
}

// ─── POST /auth/select-student ────────────────────────────────────────────────
async function selectStudent(req, res) {
    try {
        const { student_id } = req.body;

        const tempToken = req.headers.authorization?.replace("Bearer ", "");
        if (!tempToken) {
            return sendError(res, "Temporary token required", 401);
        }

        // ✅ verify with issuer check — matches how all other tokens are verified
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET, {
            issuer: "srgi-api",
        });

        if (!student_id) {
            return sendError(res, "Student ID required", 400);
        }

        const studentRecords = await findStudentsByMobile(decoded.mobile);
        const selectedStudent = studentRecords.find(s => s.id == student_id);

        if (!selectedStudent) {
            return sendError(res, "Invalid student selection", 400);
        }

        const ip = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

        // ✅ use generateAccessToken so issuer is always included
        const accessToken = generateAccessToken(
            {
                user_id: selectedStudent.id,
                mobile: decoded.mobile,
                role: "student",
                app: "student",
                registered: true,
            },
            { expiresIn: "7d" }
        );

        // ✅ issue a real refresh token too — matches single-student OTP flow.
        // Without this, frontend session checks (e.g. push-token sync) that
        // require both tokens will never pass for this flow.
        const { raw: refreshToken, hash } = tokenSvc.generateRefreshToken();

        if (!IS_DEV) {
            await tokenSvc.saveRefreshToken({
                userId: selectedStudent.id,
                app: "student",
                tokenHash: hash,
                ip,
                userAgent: req.headers["user-agent"],
            });
        }

        logger.info(`[Session:student] Student selected → student_id=${selectedStudent.id}`);

        return sendSuccess(res, {
            access_token: accessToken,
            refresh_token: refreshToken,
            token: accessToken, // kept for backward compatibility with existing clients
            student: {
                id: selectedStudent.id,
                name: selectedStudent.stud_name,
                rollNumber: selectedStudent.stud_roll_no,
                mobile: decoded.mobile,
                registered: true,
            },
            selectedStudentInfo: {
                id: selectedStudent.id,
                name: selectedStudent.stud_name,
                rollNumber: selectedStudent.stud_roll_no,
            },
            expiresIn: "7d",
        }, "Student selected successfully");

    } catch (err) {
        logger.error(`[Session:student] selectStudent error: ${err.message}`);
        return sendError(res, "Failed to select student", 500);
    }
}

// ─── GET /auth/get-students-current-mobile ────────────────────────────────────
async function getStudentsForCurrentMobile(req, res) {
    try {
        const mobile = req.user?.mobile;

        if (!mobile) {
            return sendError(res, "Mobile number not found in session", 400);
        }

        const [studentRecords] = await db.query(
            `SELECT
                base.id,
                base.stud_name,
                base.stud_roll_no,
                base.admis_on_cor_id,
                base.admis_on_sem_year_id,
                base.stud_profile_pic,
                base.stud_enroll_no,
                cor.cor_name
            FROM
                tblstud_profile AS base
            RIGHT JOIN tblcourse AS cor
            ON
                cor.id = base.admis_on_cor_id
            WHERE
                stud_mobile = ? AND base.current_status IN('regular', 'x_regular');`,
            [mobile]
        );

        if (!studentRecords.length) {
            return sendError(res, "No student profiles found", 404);
        }

        const students = studentRecords.map(s => ({
            id: s.id,
            name: s.stud_name,
            rollNumber: s.stud_roll_no,
            course: s.cor_name || s.admis_on_cor_id || "B.Tech",
            year: s.year || s.admis_on_sem_year_id || "3rd Year",
            profile: s.stud_profile_pic,
            enrollNumber: s.stud_enroll_no,
            mobile: mobile,
            registered: true,
        }));

        // ✅ temp token also needs issuer — use generateAccessToken
        const tempToken = generateAccessToken(
            {
                mobile: mobile,
                verified: true,
                isAdmin: false,
                tempAccess: true,
                app: "student",
                profileChange: true,
            },
            { expiresIn: "1h" }
        );

        logger.info(`[Session:student] Students fetched → mobile=${mobile} count=${students.length}`);

        return sendSuccess(res, {
            mobile,
            students,
            tempToken,
            studentCount: students.length,
        }, "Students fetched successfully");

    } catch (err) {
        logger.error(`[Session:student] getStudentsForCurrentMobile error: ${err.message}`);
        return sendError(res, "Failed to fetch student profiles", 500);
    }
}

// ─── POST /auth/should-show-welcome ──────────────────────────────────────────
async function shouldShowWelcome(req, res) {
    try {
        const mobile = req.body?.mobile || req.student?.mobile || null;

        if (!mobile) {
            return sendError(res, "Mobile number is required", 400);
        }

        const [rows] = await db.query(
            `SELECT * FROM user_welcome_status WHERE mobile_no = ?`,
            [mobile]
        );

        logger.debug(`[Session:student] Welcome check → mobile=${mobile} shouldShow=${rows.length === 0}`);

        return sendSuccess(res, {
            shouldShowWelcome: rows.length === 0,
        }, "Welcome status fetched");

    } catch (err) {
        logger.error(`[Session:student] shouldShowWelcome error: ${err.message}`);
        return sendError(res, "Failed to check welcome status", 500);
    }
}

// ─── POST /auth/mark-welcome-seen ─────────────────────────────────────────────
async function markWelcomeSeen(req, res) {
    try {
        const mobile = req.body?.mobile || req.student?.mobile || null;

        if (!mobile) {
            return sendError(res, "Mobile number is required", 400);
        }

        await db.query(
            `INSERT IGNORE INTO user_welcome_status (mobile_no, welcome_seen_at)
             VALUES (?, NOW())`,
            [mobile]
        );

        logger.info(`[Session:student] Welcome marked seen → mobile=${mobile}`);

        return sendSuccess(res, { mobile }, "Welcome status updated successfully");

    } catch (err) {
        logger.error(`[Session:student] markWelcomeSeen error: ${err.message}`);
        return sendError(res, "Failed to update welcome status", 500);
    }
}

module.exports = { isRegistered, selectStudent, getStudentsForCurrentMobile, shouldShowWelcome, markWelcomeSeen };