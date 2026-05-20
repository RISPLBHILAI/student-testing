const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

async function profile(req, res) {
    try {

        const studentId = req.user.user_id;

        if (!studentId) {
            return sendError(res, "Student ID not found in session", 400);
        }

        const [studentInfo] = await db.query(
            `SELECT
                    tblcollege.short_name,
                    tblcourse.cor_name,
                    tblbranch_subject.branch_sub_name,
                    tbsem_year.short_name AS sem_year,
                    tblstud_profile.*
                FROM
                    stud_current_sem_year
                LEFT JOIN tblcollege ON tblcollege.id = stud_current_sem_year.clg_id
                LEFT JOIN tblcourse ON tblcourse.id = stud_current_sem_year.cor_id
                LEFT JOIN tblbranch_subject ON tblbranch_subject.id = stud_current_sem_year.branch_id
                LEFT JOIN tbsem_year ON tbsem_year.id = stud_current_sem_year.sem_year_id
                LEFT JOIN tblstud_profile ON tblstud_profile.id = stud_current_sem_year.stud_id
                WHERE
                    stud_current_sem_year.stud_id = ?
                    AND stud_current_sem_year.current_status = 1`,
            [studentId]
        );

        const student_profile_pic = `https://myrungta.com/erp/StudentPanel/stud_photos/${studentInfo[0]?.stud_profile_pic}` || '';

        if (!studentInfo.length) {
            return sendError(res, "Student not found", 404);
        }

        logger.debug(`[Student:student] getStudentProfile → student_id=${studentId} result=${studentInfo[0]}`);

        return sendSuccess(res, {
            ...studentInfo[0],
            student_profile_pic
        }, "Student profile fetched successfully");

    }


    catch (err) {
        logger.error(`[Student:student] getStudentProfile error: ${err.message}`);
        return sendError(res, "Failed to fetch student profile", 500);
    }
}

module.exports = { profile };