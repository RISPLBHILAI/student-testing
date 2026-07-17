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
        DATE_FORMAT(rps_student_fees_structure.due_date, '%Y-%m-%d') AS due_date,
        DATE_FORMAT(rps_student_fees_structure.month_year, '%Y-%m-%d') AS month_year,
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

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let isDueDatePassed = 0;
        let isAnyPaymentDone = 0;
        let isFineCalculated = 0;

        const result = [];
        let firstUnpaidIndex = -1;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowTotalAmount = parseFloat(row.amount) || 0;
            const rowPaidAmount = parseFloat(row.paid_amount) || 0;

            // const dueDate = new Date(row.due_date);
            // dueDate.setHours(0, 0, 0, 0);
            const dueDate = row.due_date;
            const monthYear = row.month_year;

            if (today > dueDate) isDueDatePassed = 1;
            if (rowPaidAmount > 0) isAnyPaymentDone = 1;

            const isFineApplicable = parseInt(row.is_fine_applicable) || 0;

            let fineAmount = 0;
            let finePaidAmount = 0;
            let fineDays = 0;

            const principalRemaining = Math.round((rowTotalAmount - rowPaidAmount) * 100) / 100;

            if (isFineApplicable === 1 && isFineCalculated === 0 && principalRemaining > 1) {
                fineAmount = parseInt(row.fine_amount) || 20;

                if (today > dueDate) {
                    isFineCalculated = 1;
                    fineDays = Math.floor((today - dueDate) / (1000 * 60 * 60 * 24));
                    fineAmount = Math.round(fineAmount * fineDays * 100) / 100;
                } else {
                    fineAmount = 0;
                }
            }

            if (isFineApplicable > 0) {
                const [finePaidRows] = await db.query(
                    `SELECT * FROM rps_student_fees_structure
                     WHERE stud_id = ?
                       AND clg_id = ?
                       AND cor_id = ?
                       AND branch_id = ?
                       AND sem_id = ?
                       AND due_date = ?
                       AND fee_type_id = '36'
                       AND paid_amount > 0
                     LIMIT 1`,
                    [studentId, clg_id, cor_id, branch_id, sem_year_id, row.due_date]
                );

                if (finePaidRows.length > 0) {
                    const finePaidRow = finePaidRows[0];
                    if (parseFloat(finePaidRow.paid_amount) > 0) {
                        finePaidAmount = parseFloat(finePaidRow.paid_amount);
                        fineAmount = parseFloat(finePaidRow.total_amount);

                        const paidDate = new Date(finePaidRow.paid_date);
                        paidDate.setHours(0, 0, 0, 0);
                        fineDays = Math.floor((paidDate - dueDate) / (1000 * 60 * 60 * 24));
                    }
                }
            }

            let remainingAmount = Math.max(
                0,
                Math.round(
                    (Math.max(0, rowTotalAmount - rowPaidAmount) + fineAmount - finePaidAmount) * 100
                ) / 100
            );

            // Treat anything under ₹1 as fully paid — avoids showing stray
            // paise/rounding remainders as an outstanding balance.
            if (remainingAmount < 1) {
                remainingAmount = 0;
            }

            const isPaid = remainingAmount === 0;

            if (!isPaid && firstUnpaidIndex === -1) {
                firstUnpaidIndex = i;
            }

            result.push({
                ...row,
                due_date: dueDate instanceof Date
                    ? dueDate.toISOString().slice(0, 10)
                    : dueDate,
                month_year: monthYear instanceof Date
                    ? monthYear.toISOString().slice(0, 7)
                    : monthYear,
                isDueDatePassed,
                isAnyPaymentDone,
                fine_amount: fineAmount,
                fine_days: fineDays,
                fine_paid_amount: finePaidAmount,
                remaining_amount: remainingAmount,
                is_paid: isPaid,
                has_fine: fineAmount > 0,
            });
        }

        // ── Paid Details (transaction history) ──────────────────────────────
        // Mirrors the legacy `acadStudId` branch of rps_get_all_fees_paid_details.php:
        // scoped to this student's current clg/cor/branch, excludes pending/failed,
        // newest first.
        const [paidDetailRows] = await db.query(
            `SELECT id, order_id, txn_amt, txn_date, status
             FROM fee_payment_transaction_done
             WHERE stud_id = ?
               AND clg_id = ?
               AND cor_id = ?
               AND branch_id = ?
               AND status != 'pending'
               AND status != 'failed'
             ORDER BY id DESC`,
            [studentId, clg_id, cor_id, branch_id]
        );

        logger.info(`[Fees] Monthly fee details fetched for student: ${studentId}`);

        return sendSuccess(
            res,
            {
                fees: result,
                first_unpaid_index: firstUnpaidIndex,
                paidDetails: paidDetailRows,
            },
            'Monthly fee details fetched successfully'
        );

    } catch (err) {
        logger.error(`[Fees] getMonthlyFeesDetails error: ${err.message}`);
        return sendError(res, 'Failed to fetch monthly fee details', 500);
    }
}

module.exports = { getBaseFees, getMonthlyFeesDetails };