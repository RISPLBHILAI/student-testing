const jwt = require("jsonwebtoken");
const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const { generateAccessToken } = require("../../../../shared/services/tokenService");
const config = require("../../config");

// Fields the admin can search on. "all" searches every one of them.
const SEARCH_FIELDS = ["all", "name", "roll", "id", "father", "mobile"];
const SEARCH_LIMIT = 30;

// Escape LIKE wildcards so a "%" or "_" typed by the admin is matched literally
function likeEscape(s) {
    return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Every word must appear somewhere in `column` (so "rahul kumar" also finds
// "Rahul Dev Kumar").
function wordsClause(column, words, params) {
    const parts = words.map((w) => {
        params.push(`%${likeEscape(w)}%`);
        return `${column} LIKE ?`;
    });
    return `(${parts.join(" AND ")})`;
}

function buildWhere(field, q) {
    const params = [];
    const words = q.split(/\s+/).filter(Boolean);
    const isNumeric = /^\d+$/.test(q);
    const contains = `%${likeEscape(q)}%`;
    const prefix = `${likeEscape(q)}%`;

    const byName = () => wordsClause("p.stud_name", words, params);
    const byFather = () => wordsClause("p.stud_fathername", words, params);
    const byRoll = () => {
        params.push(contains, contains, contains);
        return `(p.stud_roll_no LIKE ? OR p.university_roll_no LIKE ? OR p.stud_enroll_no LIKE ?)`;
    };
    const byId = () => {
        params.push(q, q);
        return `(p.id = ? OR p.essl_id = ?)`;
    };
    const byMobile = () => {
        params.push(prefix, prefix);
        return `(p.stud_mobile LIKE ? OR p.stud_father_mobno LIKE ?)`;
    };

    let clause;
    switch (field) {
        case "name": clause = byName(); break;
        case "father": clause = byFather(); break;
        case "roll": clause = byRoll(); break;
        case "id": clause = byId(); break;
        case "mobile": clause = byMobile(); break;
        default: {
            const parts = [byName(), byFather(), byRoll()];
            if (isNumeric) {
                parts.push(byId());
                if (q.length >= 4) parts.push(byMobile());
            }
            clause = `(${parts.join(" OR ")})`;
        }
    }
    return { clause, params };
}

// ─── GET /admin/search-students?q=&field= ────────────────────────────────────
async function searchStudents(req, res) {
    try {
        const q = String(req.query.q || "").trim();
        const field = SEARCH_FIELDS.includes(req.query.field) ? req.query.field : "all";

        // IDs can be short; everything else needs 2+ characters
        const minLen = field === "id" ? 1 : 2;
        if (q.length < minLen) {
            return sendSuccess(res, [], "No results");
        }
        if ((field === "id" || field === "mobile") && !/^\d+$/.test(q)) {
            return sendSuccess(res, [], "Enter digits only");
        }

        const { clause, params } = buildWhere(field, q);

        // Exact ID / roll matches first, then names starting with the query
        const rankParams = [q, q, q, q, `${likeEscape(q)}%`];

        const [rows] = await db.query(
            `SELECT
                p.id,
                p.stud_name,
                p.essl_id,
                p.stud_mobile,
                p.stud_fathername,
                p.stud_roll_no,
                p.university_roll_no,
                p.stud_enroll_no,
                p.stud_profile_pic,
                p.current_status,
                c.short_name   AS clg_name,
                cor.cor_name,
                b.branch_sub_name,
                sy.short_name  AS sem_name
            FROM tblstud_profile p
            LEFT JOIN stud_current_sem_year cs ON cs.stud_id    = p.id
            LEFT JOIN tblcollege            c  ON c.id          = cs.clg_id
            LEFT JOIN tblcourse             cor ON cor.id       = cs.cor_id
            LEFT JOIN tblbranch_subject     b  ON b.id          = cs.branch_id
            LEFT JOIN tbsem_year            sy ON sy.id         = cs.sem_year_id
            WHERE p.current_status <> 'cancelled'
              AND ${clause}
            ORDER BY
                CASE
                    WHEN p.id = ? OR p.essl_id = ? THEN 0
                    WHEN p.stud_roll_no = ? OR p.university_roll_no = ? THEN 1
                    WHEN p.stud_name LIKE ? THEN 2
                    ELSE 3
                END,
                p.stud_name
            LIMIT ${SEARCH_LIMIT * 2}`,
            [...params, ...rankParams]
        );

        // A student can have more than one current-sem row — keep the first
        const seen = new Set();
        const students = [];
        for (const row of rows) {
            if (seen.has(row.id)) continue;
            seen.add(row.id);
            students.push({
                id: row.id,
                name: row.stud_name,
                profile: row.stud_profile_pic,
                rollNumber: row.stud_roll_no,
                universityRollNo: row.university_roll_no,
                enrollNumber: row.stud_enroll_no,
                fatherName: row.stud_fathername,
                esslid: row.essl_id,
                mobile: row.stud_mobile,
                college: row.clg_name,
                course: row.cor_name,
                branch: row.branch_sub_name,
                year: row.sem_name,
                status: row.current_status,
            });
            if (students.length >= SEARCH_LIMIT) break;
        }

        logger.debug(`[Admin:student] searchStudents → field=${field} q="${q}" results=${students.length}`);

        return sendSuccess(res, students, "Search results fetched");

    } catch (err) {
        logger.error(`[Admin:student] searchStudents error: ${err.message}`);
        return sendError(res, "Search failed", 500);
    }
}

// ─── POST /admin/impersonate-student ─────────────────────────────────────────
// Also used by the app to silently renew an expired impersonation token while
// the admin token is still valid.
async function impersonateStudent(req, res) {
    try {
        const { studentId } = req.body;

        if (!studentId || !/^\d+$/.test(String(studentId))) {
            return sendError(res, "Valid studentId is required", 400);
        }

        const [rows] = await db.query(
            `SELECT
                id,
                stud_name,
                stud_profile_pic,
                stud_roll_no,
                stud_enroll_no,
                stud_fathername,
                essl_id,
                stud_mobile,
                current_status
             FROM tblstud_profile
             WHERE id = ?
             LIMIT 1`,
            [studentId]
        );

        if (!rows.length) {
            return sendError(res, "Student not found", 404);
        }

        const student = rows[0];

        if (student.current_status === "cancelled") {
            return sendError(res, "This student's admission is cancelled", 403);
        }

        const token = generateAccessToken(
            {
                user_id: student.id,
                name: student.stud_name,
                mobile: student.stud_mobile,
                role: "student",
                app: "student",
                registered: true,
                // Marks the token so logout / push / profile-switch endpoints
                // never act on the real student's account.
                impersonation: true,
                impersonatedBy: req.user.mobile,
            },
            { expiresIn: config.admin.impersonationExpiresIn }
        );

        const { exp } = jwt.decode(token) || {};

        logger.info(
            `[Admin:student] Impersonate → admin=${req.user.mobile} student_id=${student.id} name=${student.stud_name}`
        );

        return sendSuccess(res, {
            token,
            expires_at: exp || null,
            student: {
                id: student.id,
                name: student.stud_name,
                profile: student.stud_profile_pic,
                rollNumber: student.stud_roll_no,
                enrollNumber: student.stud_enroll_no,
                fatherName: student.stud_fathername,
                esslid: student.essl_id,
                mobile: student.stud_mobile,
                registered: true,
            },
        }, "Impersonation token generated");

    } catch (err) {
        logger.error(`[Admin:student] impersonateStudent error: ${err.message}`);
        return sendError(res, "Impersonation failed", 500);
    }
}

// ─── GET /admin/session ──────────────────────────────────────────────────────
// Lets the app check the stored admin token is still usable (on launch and
// when leaving impersonation) without side effects.
function adminSession(req, res) {
    const raw = req.headers.authorization?.split(" ")[1];
    const exp = req.user.exp || (raw && jwt.decode(raw)?.exp) || null;
    return sendSuccess(res, {
        valid: true,
        mobile: req.user.mobile,
        expires_at: exp,
    }, "Admin session valid");
}

// ─── POST /admin/end-impersonation ───────────────────────────────────────────
// Audit only — impersonation tokens are stateless and simply stop being used.
function endImpersonation(req, res) {
    const studentId = req.body?.studentId ?? "-";
    logger.info(`[Admin:student] End impersonation → admin=${req.user.mobile} student_id=${studentId}`);
    return sendSuccess(res, null, "Impersonation ended");
}

module.exports = { searchStudents, impersonateStudent, adminSession, endImpersonation };
