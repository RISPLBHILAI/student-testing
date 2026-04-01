const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

async function getAllPaidFees(req, res) {
    try {
        const studentId = req.user.user_id;

        if (!studentId || isNaN(studentId)) {
            return sendError(res, 'Student ID is required and must be a valid number', 400);
        }

        logger.info(`[Receipt] Fetching paid receipts for student: ${studentId}`);

        const [rows] = await db.query(
            `SELECT
                tbsem_year.sem_year_name,
                tblstud_profile.stud_category AS category,
                fee_payment_transaction_scholarship_details.*,
                tblcollege.clg_name,
                tblcourse.cor_name,
                tblbranch_subject.branch_sub_name,
                fee_payment_transaction_begin.payment_types
             FROM fee_payment_transaction_scholarship_details
             LEFT JOIN tblcollege
                ON tblcollege.id = fee_payment_transaction_scholarship_details.clg_id
             LEFT JOIN tblcourse
                ON tblcourse.id = fee_payment_transaction_scholarship_details.cor_id
             LEFT JOIN tblbranch_subject
                ON tblbranch_subject.id = fee_payment_transaction_scholarship_details.branch_id
             LEFT JOIN fee_payment_transaction_begin
                ON fee_payment_transaction_begin.id = fee_payment_transaction_scholarship_details.id
             INNER JOIN tbsem_year
                ON fee_payment_transaction_scholarship_details.sem_id = tbsem_year.id
             INNER JOIN tblstud_profile
                ON fee_payment_transaction_scholarship_details.stud_id = tblstud_profile.id
             WHERE fee_payment_transaction_scholarship_details.stud_id = ?
               AND fee_payment_transaction_scholarship_details.payment_status = '1'`,
            [studentId]
        );

        logger.info(`[Receipt] Found ${rows.length} receipts for student: ${studentId}`);

        return sendSuccess(res, { receipts: rows }, 'Receipts fetched successfully');

    } catch (err) {
        logger.error(`[Receipt] getAllPaidFees error: ${err.message}`);
        return sendError(res, 'Internal server error while fetching receipts', 500);
    }
}

module.exports = { getAllPaidFees };
