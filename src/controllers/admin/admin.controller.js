const jwt = require("jsonwebtoken");
const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const { generateAccessToken } = require("../../../../shared/services/tokenService");

// ─── GET /auth/admin/students/search ─────────────────────────────────────────
async function searchStudents(req, res) {
    try {
        const { q } = req.query;

        if (!q || q.trim().length < 2) {
            return sendSuccess(res, [], "No results");
        }

        const [rows] = await db.query(
            `SELECT
                tblstud_profile.id,
                tblstud_profile.stud_name,
                tblstud_profile.essl_id,
                tblstud_profile.stud_mobile,
                tblstud_profile.stud_email_id,
                tblstud_profile.stud_fathername,
                tblstud_profile.stud_roll_no,
                tblstud_profile.university_roll_no,
                tblstud_profile.stud_profile_pic,
                tblstud_profile.stud_father_mobno,
                tblstud_profile.current_status,
                tblcollege.short_name        AS clg_name,
                tblcourse.cor_name,
                tblbranch_subject.branch_sub_name,
                tbsem_year.short_name        AS sem_name,
                stud_current_sem_year.sem_year_id,
                stud_current_sem_year.clg_id,
                stud_current_sem_year.cor_id,
                stud_current_sem_year.branch_id
            FROM tblstud_profile
            JOIN stud_current_sem_year  ON tblstud_profile.id             = stud_current_sem_year.stud_id
            JOIN tblcollege             ON stud_current_sem_year.clg_id   = tblcollege.id
            JOIN tblcourse              ON stud_current_sem_year.cor_id   = tblcourse.id
            JOIN tblbranch_subject      ON stud_current_sem_year.branch_id = tblbranch_subject.id
            JOIN tbsem_year             ON stud_current_sem_year.sem_year_id = tbsem_year.id
            WHERE
                tblstud_profile.current_status <> 'cancelled'
                AND (
                    tblstud_profile.stud_name          LIKE ?
                    OR tblstud_profile.university_roll_no LIKE ?
                    OR tblstud_profile.stud_roll_no       LIKE ?
                )
            ORDER BY stud_name, clg_name, cor_name, branch_sub_name, sem_name
            LIMIT 10`,
            [`%${q}%`, `%${q}%`, `%${q}%`]
        );

        const students = rows.map(row => ({
            id: row.id,
            name: row.stud_name,
            profile: row.stud_profile_pic,
            rollNumber: row.stud_roll_no,
            enrollNumber: row.stud_enroll_no,
            fatherName: row.stud_fathername,
            esslid: row.essl_id,
            mobile: row.stud_mobile,
            course: row.cor_name,
            year: row.sem_name,
        }));

        logger.debug(`[Admin:student] searchStudents → q="${q}" results=${students.length}`);

        return sendSuccess(res, students, "Search results fetched");

    } catch (err) {
        logger.error(`[Admin:student] searchStudents error: ${err.message}`);
        return sendError(res, "Search failed", 500);
    }
}

// ─── POST /auth/admin/impersonate ─────────────────────────────────────────────
async function impersonateStudent(req, res) {
    try {
        const { studentId } = req.body;

        if (!studentId) {
            return sendError(res, "studentId is required", 400);
        }

        const [rows] = await db.query(
            `SELECT
                id,
                stud_name,
                stud_profile_pic,
                stud_roll_no,
                stud_enroll_no,
                essl_id,
                stud_contactno
             FROM tblstud_profile
             WHERE id = ?
             LIMIT 1`,
            [studentId]
        );

        if (!rows.length) {
            return sendError(res, "Student not found", 404);
        }

        const student = rows[0];

        const token = generateAccessToken({
            user_id: student.id,
            name: student.stud_name,
            mobile: student.stud_mobile,
            role: "student",
            app: "student",
            registered: true,
        });

        logger.info(`[Admin:student] Impersonate → student_id=${student.id} name=${student.stud_name}`);

        return sendSuccess(res, {
            token,
            student: {
                id: student.id,
                name: student.stud_name,
                profile: student.stud_profile_pic,
                rollNumber: student.stud_roll_no,
                enrollNumber: student.stud_enroll_no,
                esslid: student.essl_id,
                mobile: student.stud_contactno,
                registered: true,
            },
        }, "Impersonation token generated");

    } catch (err) {
        logger.error(`[Admin:student] impersonateStudent error: ${err.message}`);
        return sendError(res, "Impersonation failed", 500);
    }
}

module.exports = { searchStudents, impersonateStudent };