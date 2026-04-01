const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

async function getBaseFees(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Fees] Fetching base fees for student: ${studentId}`);

        const [studentRows] = await db.query(
            `SELECT * FROM stud_current_sem_year WHERE stud_id = ? AND current_status = 1`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = studentRows[0];

        const [rows] = await db.query(
            `SELECT
                fees_type_master.fees_type_name,
                SUM(rps_student_fees_structure.total_amount) AS amount
             FROM rps_student_fees_structure
             LEFT JOIN fees_type_master
                ON rps_student_fees_structure.fee_type_id = fees_type_master.id
                AND fees_type_master.active_status = 1
             WHERE rps_student_fees_structure.stud_id = ?
               AND rps_student_fees_structure.clg_id = ?
               AND rps_student_fees_structure.cor_id = ?
               AND rps_student_fees_structure.branch_id = ?
               AND rps_student_fees_structure.sem_id = ?
             GROUP BY fee_type_id`,
            [studentId, clg_id, cor_id, branch_id, sem_year_id]
        );

        if (rows.length === 0) {
            return sendError(res, 'No fee structure found for this student', 404);
        }

        logger.info(`[Fees] Base fees fetched for student: ${studentId}`);

        return sendSuccess(res, { fees: rows }, 'Fee structure fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getBaseFees error: ${err.message}`);
        return sendError(res, 'Failed to fetch fee structure', 500);
    }
}

async function getMonthlyFeesDetails(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Fees] Fetching monthly fee details for student: ${studentId}`);

        const [studentRows] = await db.query(
            `SELECT * FROM stud_current_sem_year WHERE stud_id = ? AND current_status = 1`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = studentRows[0];

        const [rows] = await db.query(
            `SELECT
                SUM(rps_student_fees_structure.total_amount) AS amount,
                SUM(rps_student_fees_structure.paid_amount) AS paid_amount,
                rps_student_fees_structure.due_date,
                rps_student_fees_structure.is_fine_applicable,
                fine_master.q1_fine AS fine_amount
             FROM rps_student_fees_structure
             LEFT JOIN fees_type_master
                ON rps_student_fees_structure.fee_type_id = fees_type_master.id
                AND fees_type_master.active_status = 1
             LEFT JOIN fine_master
                ON fine_master.clg_id = rps_student_fees_structure.clg_id
                AND fine_master.cor_id = rps_student_fees_structure.cor_id
                AND fine_master.branch_id = rps_student_fees_structure.branch_id
                AND fine_master.sem_id = rps_student_fees_structure.sem_id
                AND fine_master.session_id = rps_student_fees_structure.session_id
             WHERE rps_student_fees_structure.stud_id = ?
               AND rps_student_fees_structure.clg_id = ?
               AND rps_student_fees_structure.cor_id = ?
               AND rps_student_fees_structure.branch_id = ?
               AND rps_student_fees_structure.sem_id = ?
             GROUP BY rps_student_fees_structure.due_date
             ORDER BY rps_student_fees_structure.due_date ASC`,
            [studentId, clg_id, cor_id, branch_id, sem_year_id]
        );

        if (rows.length === 0) {
            return sendError(res, 'No fee structure found for this student', 404);
        }

        logger.info(`[Fees] Monthly fee details fetched for student: ${studentId}`);

        return sendSuccess(res, { fees: rows }, 'Monthly fee details fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getMonthlyFeesDetails error: ${err.message}`);
        return sendError(res, 'Failed to fetch monthly fee details', 500);
    }
}


module.exports = { getBaseFees, getMonthlyFeesDetails };