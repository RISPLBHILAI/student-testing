const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const Timetable = require('../../models/Timetable');

async function dashboard(req, res) {
    try {
        const student_id = req.user.user_id;

        if (!student_id) {
            return sendError(res, "Student not found", 404);
        }

        const [studentInfo] = await db.query(
            `SELECT
                tp.id,
                tp.stud_name,
                tp.stud_profile_pic,
                tp.essl_id,
                scs.clg_id,
                scs.cor_id,
                scs.branch_id,
                scs.sem_year_id
            FROM tblstud_profile tp 
                LEFT JOIN stud_current_sem_year scs ON tp.id = scs.stud_id
            WHERE tp.id = ?
            LIMIT 1`,
            [student_id]
        );

        if (!studentInfo.length) {
            return sendError(res, "Student not found", 404);
        }

          const student_profile_pic = `https://myrungta.com/erp/StudentPanel/stud_photos/${studentInfo[0]?.stud_profile_pic}` || '';


        const { essl_id, clg_id, cor_id, branch_id, sem_year_id } = studentInfo[0];

        const today = new Date().toISOString().split('T')[0];

        // ── Default attendance (always has a value now) ──────────────────
        let todayIntime = {
            date: today,
            attendanceStatus: 'absent',
            inTime: null,
            outTime: null,
            message: 'No attendance record found for today'
        };

        // ── Check holiday ────────────────────────────────────────────────
        const [holidayRows] = await db.query(
            `SELECT holidayDate, description
                FROM holiday_master
                WHERE DATE(holidayDate) = ?
                  AND ((clgId = ? AND corId = '0' AND branchId = '0' AND semId = '0')
                   OR (clgId = ? AND corId = ? AND branchId = ? AND semId = ?))
                  AND holidayDay != 'Sunday'`,
            [today, clg_id, clg_id, cor_id, branch_id, sem_year_id]
        );

        if (holidayRows.length > 0) {
            todayIntime = {
                date: today,
                attendanceStatus: 'holiday',
                inTime: null,
                outTime: null,
                holidayReason: holidayRows[0].description,
                message: 'Today is a holiday'
            };

        } else if (!essl_id) {
            todayIntime = {
                date: today,
                attendanceStatus: 'no_essl',
                inTime: "",
                outTime: "",
                message: 'ESSL ID not found for student'
            };
        } else {
            // ── Only check attendance if NOT a holiday ───────────────────
            const [attendanceRows] = await db.query(
                `SELECT
                    DATE(DateOnly) as attendedDate,
                    TIME(FirstLogDate) AS attendanceStartTime,
                    TIME(LastLogDate) AS attendanceEndTime,
                    FirstLogDate,
                    LastLogDate
                FROM device_logs
                WHERE UserId = ?
                    AND DATE(DateOnly) = ?
                    AND DeviceCategory = 'institute'
                    AND DeviceId != '21'
                
                LIMIT 1`,
                [essl_id, today]
            );

            if (attendanceRows.length > 0) {
                const { attendanceStartTime, attendanceEndTime } = attendanceRows[0];
                todayIntime = {
                    date: today,
                    attendanceStatus: 'present',
                    inTime: attendanceStartTime,
                    outTime: attendanceEndTime,
                    message: 'Today is in-time'
                };
            }

        }

        // console.log(`📚 Fetching today's timetable for student ID: ${student_id}`);

        const result = await Timetable.getTodayTimetable(student_id);
        const formattedTimetable = Timetable.formatTimetableData(result.timetable);

        return sendSuccess(res, {
            student: {
                ...studentInfo[0],
                student_profile_pic
            },
            attendance: todayIntime,
            timeTable: formattedTimetable
        }, "Dashboard fetched successfully");

    } catch (err) {
        logger.error(`[Dashboard:student] getDashboard error: ${err.message}`);
        return sendError(res, "Failed to fetch dashboard", 500);
    }
}


async function allSubjects(req, res) {
    try {
        const studentId = req.user.user_id;

        if (!studentId) {
            return sendError(res, 'Student not registered. Subject information not available.', 400);
        }

        logger.info(`[Subjects] Fetching subjects for student: ${studentId}`);

        const [rows] = await db.query(
            `SELECT
                    MAX(fsua.id) AS id,
                    sa.subject_name,
                    sa.id AS subject_id,
                    sa.semester_id AS sem_year_id,
                    MAX(em.emp_name) AS emp_name,
                    sa.subject_type,
                    MAX(fsua.emp_id) AS emp_id,
                    MAX(fsua.session) AS session,
                    MAX(fsua.clg_id) AS clg_id
                FROM faculty_subject_unit_allotment fsua
                INNER JOIN stud_current_sem_year scsy
                    ON fsua.clg_id = scsy.clg_id
                    AND fsua.courseID = scsy.cor_id
                    AND fsua.branch_id = scsy.branch_id
                LEFT JOIN subject_allotment sa
                    ON fsua.subject_id = sa.id
                LEFT JOIN employee_master em
                    ON fsua.emp_id = em.emp_id
                WHERE
                    scsy.stud_id = ?
                    AND sa.subject_name IS NOT NULL
                    AND sa.is_active = 1
                    AND sa.semester_id = scsy.sem_year_id
                    AND em.enable_status = 1
                GROUP BY
                    sa.id,
                    sa.subject_name,
                    sa.semester_id,
                    sa.subject_type`,
            [studentId]
        );

        return sendSuccess(res, {
            studentId,
            totalSubjects: rows.length,
            subjects: rows
        }, "Subjects retrieved successfully", 200);

    } catch (error) {
        logger.error(`[Subjects] getAllSubjects error: ${error.message}`);
        return sendError(res, 'Failed to fetch subject information for student', 500);
    }
}

async function studentResults(req, res) {
    try {
        const studentId = req.user.user_id;

        if (!studentId) {
            return sendError(res, 'Student not registered. Results information not available.', 400);
        }

        const [universityRollNoRows] = await db.query(
            `SELECT university_roll_no
             FROM tblstud_profile
               WHERE id = ?`,
            [studentId]
        );

        const universityRollNo = universityRollNoRows[0]?.university_roll_no;

        if (!universityRollNo) {
            return sendError(res, 'University roll number is required to fetch results.', 400);
        }

        logger.info(`[Results] Fetching results for university roll no: ${universityRollNo}`);

        const [rows] = await db.query(
            `SELECT
                urs.*,
                sa.subject_name
             FROM university_result_of_students urs
             INNER JOIN subject_allotment sa
                ON sa.subject_code = urs.subject_code
             WHERE
                urs.Roll_No = ?
                AND sa.is_active = 1
             ORDER BY urs.semester`,
            [universityRollNo]
        );

        return sendSuccess(res, {
            universityRollNo,
            totalSubjects: rows.length,
            subjects: rows
        }, "Student results retrieved successfully", 200);

    } catch (error) {
        logger.error(`[Results] getStudentResults error: ${error.message}`);
        return sendError(res, 'Failed to fetch student results', 500);
    }
}

module.exports = { dashboard, allSubjects, studentResults };