const db = require("../../../shared/db/mysql");

class PaymentModel {

    static async createTransactionBegin(data) {
        const {
            paymentType,
            orderId,
            studentId,
            studName,
            clgId,
            corId,
            branchId,
            semId,
            amount,
            fineAmt,
            pgName = 'billdesk'
        } = data;

        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const [result] = await db.query(
            `INSERT INTO fee_payment_transaction_begin(
                payment_types,
                order_id,
                stud_id,
                stud_name,
                clg_id,
                cor_id,
                branch_id,
                sem_id,
                tot_amt,
                created_on,
                total_fine,
                pg_name
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                paymentType,
                orderId,
                studentId,
                studName,
                clgId,
                corId,
                branchId,
                semId,
                amount,
                currentTimestamp,
                fineAmt,
                pgName
            ]
        );

        return result;
    }

    static async createTransactionScholarshipDetails(data) {
        const {
            orderId,
            studentId,
            studName,
            clgId,
            corId,
            branchId,
            semId,
            amount,
            feesDetails,
            fineDetails,
            ipAddress
        } = data;

        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const [result] = await db.query(
            `INSERT INTO fee_payment_transaction_scholarship_details(
                order_id,
                payment_status,
                stud_id,
                stud_name,
                clg_id,
                cor_id,
                branch_id,
                sem_id,
                caution_money,
                kit_fee,
                apron_fee,
                other_fee,
                sport_fee,
                book_bank_fee,
                tution_fee,
                old_due,
                old_due_with_fine,
                due_date,
                scholarship_amt,
                received_scholarship,
                stud_category,
                paid_amt,
                tran_try_date,
                created_by,
                ipaddress,
                fine_amt,
                fine_applied_on,
                fine_multiplier
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderId,
                0,
                studentId,
                studName,
                clgId,
                corId,
                branchId,
                semId,
                feesDetails.caution_money || 0,
                feesDetails.kit_fee || 0,
                feesDetails.apron_fee || 0,
                feesDetails.other_fee || 0,
                feesDetails.sport_fee || 0,
                feesDetails.book_bank_fee || 0,
                feesDetails.tution_fee || 0,
                feesDetails.old_due || 0,
                fineDetails.fine_amt || 0,
                null,
                feesDetails.scholarship_fee || 0,
                0,
                '',
                amount,
                currentTimestamp,
                studentId,
                ipAddress,
                fineDetails.fine_amt || 0,
                fineDetails.fine_applied_on || '',
                fineDetails.fine_multiplier || 0
            ]
        );

        return result;
    }

    static async getStudentProfile(studentId) {
        const [rows] = await db.query(
            'SELECT stud_name, stud_mobile, stud_email_id, stud_roll_no FROM tblstud_profile WHERE id = ?',
            [studentId]
        );
        return rows[0] || null;
    }

    static async getStudentCurrentSem(studentId) {
        const [rows] = await db.query(
            'SELECT stud_id, clg_id, cor_id, branch_id, sem_year_id FROM stud_current_sem_year WHERE stud_id = ? LIMIT 1',
            [studentId]
        );
        return rows[0] || null;
    }

    static async getCollegeDetails(clgId) {
        const [rows] = await db.query(
            'SELECT clg_code, clg_name, short_name FROM tblcollege WHERE id = ?',
            [clgId]
        );
        return rows[0] || null;
    }

    static async updateTransactionBegin(data) {
        const {
            orderId,
            txnAmt,
            txnId,
            txnDate,
            merchantId,
            flag = 1
        } = data;

        const [result] = await db.query(
            `UPDATE fee_payment_transaction_begin 
             SET txn_amt = ?, 
                 txn_id = ?, 
                 txn_date = ?,
                 status = ?,
                 m_id = ?, 
                 flag = ?
             WHERE order_id = ?`,
            [txnAmt, txnId, txnDate, 'SUCCESS', merchantId, flag, orderId]
        );

        return result;
    }

    static async updateTransactionScholarshipDetails(data) {
        const {
            orderId,
            paymentStatus = 1,
            paymentMode = 'UPI'
        } = data;

        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const [result] = await db.query(
            `UPDATE fee_payment_transaction_scholarship_details 
             SET payment_status = ?, 
                 tran_done_date = ?, 
                 payment_mode = ?
             WHERE order_id = ?`,
            [paymentStatus, currentTimestamp, paymentMode, orderId]
        );

        return result;
    }

    static async createTransactionDone(data) {
        const {
            orderId,
            txnAmt,
            txnId,
            txnDate,
            merchantId,
            checksum,
            gateway,
            bankTxnId,
            status,
            feesDetails
        } = data;

        const [studentRows] = await db.query(
            'SELECT stud_id FROM fee_payment_transaction_begin WHERE order_id LIKE ?',
            [orderId]
        );

        const { stud_id } = studentRows[0];

        console.log('🧑‍🎓Student Id:', stud_id);

        const studentProfile = await this.getStudentProfile(stud_id);
        if (!studentProfile) {
            return res.status(404).json({
                success: false,
                message: 'Student not found'
            });
        }

        const { stud_name, stud_mobile, stud_email_id } = studentProfile;

        const currentSem = await this.getStudentCurrentSem(stud_id);
        if (!currentSem) {
            return res.status(404).json({
                success: false,
                message: 'Student semester details not found'
            });
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = currentSem;

        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const [result] = await db.query(
            `INSERT INTO fee_payment_transaction_done(
                order_id,
                stud_id,
                stud_name,
                clg_id,
                cor_id,
                branch_id,
                sem_id,
                txn_amt,
                txn_id,
                txn_date,
                m_id,
                CHECKSUM,
                gateway,
                bank_txn_id,
                status,
                flag,
                created_on,
                caution_money_rec,
                kit_fee_rec,
                apron_fee_rec,
                other_fee_rec,
                sport_fee_rec,
                book_bank_rec,
                tution_fee_rec,
                old_dues_rec,
                currsem_previous_paid_rec
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                orderId,
                stud_id,
                stud_name,
                clg_id,
                cor_id,
                branch_id,
                sem_year_id,
                txnAmt,
                txnId,
                txnDate,
                merchantId,
                checksum || '',
                gateway || 'BILLDESK',
                bankTxnId || '',
                status,
                1,
                currentTimestamp,
                feesDetails.caution_money || 0,
                feesDetails.kit_fee || 0,
                feesDetails.apron_fee || 0,
                feesDetails.other_fee || 0,
                feesDetails.sport_fee || 0,
                feesDetails.book_bank_fee || 0,
                feesDetails.tution_fee || 0,
                feesDetails.old_due || 0,
                txnAmt
            ]
        );

        return result;
    }

    static async saveBilldeskResponse(data) {
        const {
            orderId,
            responseData
        } = data;

        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const [result] = await db.query(
            `INSERT INTO billdesk_response_json(
                order_id,
                response_data,
                date_time
            ) VALUES (?, ?, ?)`,
            [orderId, JSON.stringify(responseData), currentTimestamp]
        );

        return result;
    }

    static async getTransactionBegin(orderId) {
        const [rows] = await db.query(
            `SELECT * FROM fee_payment_transaction_begin WHERE order_id = ?`,
            [orderId]
        );
        return rows[0] || null;
    }

    static async getTransactionScholarshipDetails(orderId) {
        const [rows] = await db.query(
            `SELECT * FROM fee_payment_transaction_scholarship_details WHERE order_id = ?`,
            [orderId]
        );
        return rows[0] || null;
    }

    // ============================================
    // NEW METHODS FOR PAYMENT TYPE 1 PROCESSING
    // ============================================

    /**
     * Update student current semester payment details
     */
    static async updateStudCurrentSemYear(data) {
        const {
            studId,
            txnAmt,
            totalCurrentTutionFees,
            totalPaidAmt,
            receiveableScholarship,
            updatePaidDoneDate = true
        } = data;

        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const totalPaid = parseInt(txnAmt) + parseInt(totalPaidAmt);

        let query;
        let params;

        if (parseInt(totalCurrentTutionFees) < totalPaid) {
            if (parseInt(totalCurrentTutionFees) > totalPaidAmt) {
                query = `UPDATE stud_current_sem_year 
                         SET paid_amt = (paid_amt + ?), 
                             paid_done_date = ?, 
                             reciveable_scholarship = ? 
                         WHERE stud_id = ?`;
                params = [txnAmt, currentTimestamp, receiveableScholarship, studId];
            } else {
                query = `UPDATE stud_current_sem_year 
                         SET paid_amt = (paid_amt + ?), 
                             reciveable_scholarship = ? 
                         WHERE stud_id = ?`;
                params = [txnAmt, receiveableScholarship, studId];
            }
        } else {
            query = `UPDATE stud_current_sem_year 
                     SET paid_amt = (paid_amt + ?), 
                         paid_done_date = ?, 
                         reciveable_scholarship = ? 
                     WHERE stud_id = ?`;
            params = [txnAmt, currentTimestamp, receiveableScholarship, studId];
        }

        const [result] = await db.query(query, params);
        return result;
    }

    /**
     * Update scholarship details after payment
     */
    static async updateScholarshipDetailsAfterPayment(data) {
        const {
            orderId,
            studId,
            ipAddress,
            paymentStatus = 1
        } = data;

        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');

        const [result] = await db.query(
            `UPDATE fee_payment_transaction_scholarship_details 
             SET payment_status = ?, 
                 tran_done_date = ?, 
                 created_by = ?, 
                 ipaddress = ? 
             WHERE order_id = ? 
             ORDER BY id DESC LIMIT 1`,
            [paymentStatus, currentTimestamp, studId, ipAddress, orderId]
        );

        return result;
    }

    /**
     * Check and update applied scholarship log
     */
    static async updateAppliedScholarshipLogPaymentDone(studId) {
        const currentDate = new Date().toISOString().slice(0, 10);

        const [rows] = await db.query(
            `SELECT payment_done_on, id FROM applied_scholarship_log 
             WHERE stud_id = ? 
             ORDER BY id DESC LIMIT 1`,
            [studId]
        );

        if (rows.length > 0) {
            const { payment_done_on, id } = rows[0];
            if (!payment_done_on) {
                await db.query(
                    `UPDATE applied_scholarship_log 
                     SET payment_done_on = ?, payment_done = '1' 
                     WHERE id = ?`,
                    [currentDate, id]
                );
            }
        }

        return rows[0] || null;
    }

    /**
     * Get payment scholarship details by order ID and student ID
     */
    static async getPaymentScholarshipDetailsByOrderAndStudent(orderId, studentId) {
        const [rows] = await db.query(
            `SELECT * FROM fee_payment_transaction_scholarship_details 
             WHERE order_id = ? AND stud_id = ? 
             ORDER BY id DESC LIMIT 1`,
            [orderId, studentId]
        );
        return rows[0] || null;
    }

    /**
     * Get sum of applicable fees for student
     */
    static async getStudentApplicableFeeSum(data) {
        const { studId, clgId, corId, branchId, semId } = data;

        const [rows] = await db.query(
            `SELECT SUM(fee_amount) AS total_applicable_fee, 
                    SUM(fee_paid) AS total_paid_fee 
             FROM student_applicable_fee 
             WHERE stud_id = ? AND clg_id = ? AND cor_id = ? 
                   AND branch_id = ? AND sem_id = ? 
                   AND fee_category NOT IN (20, 17, 18, 11, 10)`,
            [studId, clgId, corId, branchId, semId]
        );

        return rows[0] || { total_applicable_fee: 0, total_paid_fee: 0 };
    }

    /**
     * Get student applicable fees to update (where fee_amount > fee_paid)
     */
    static async getStudentApplicableFeesToUpdate(data) {
        const { studId, clgId, corId, branchId, semId } = data;

        const [rows] = await db.query(
            `SELECT * FROM student_applicable_fee 
             WHERE stud_id = ? AND clg_id = ? AND cor_id = ? 
                   AND branch_id = ? AND sem_id = ? 
                   AND fee_amount > fee_paid 
                   AND fee_category NOT IN (20, 17, 18, 11)`,
            [studId, clgId, corId, branchId, semId]
        );

        return rows;
    }

    /**
     * Get pending scholarship logs
     */
    static async getPendingScholarshipLogs(data) {
        const { studId, clgId, corId, branchId, semId } = data;

        const [rows] = await db.query(
            `SELECT * FROM applied_scholarship_log 
             WHERE stud_id = ? AND clg_id = ? AND cor_id = ? 
                   AND branch_id = ? AND sem_id = ? 
                   AND CAST(reciveable_scholarship AS SIGNED) > CAST(paid_amt AS SIGNED) 
                   AND (payment_done != '1' OR payment_done IS NULL OR payment_done = '0') 
             ORDER BY id ASC`,
            [studId, clgId, corId, branchId, semId]
        );

        return rows;
    }

    /**
     * Update student applicable fee record
     */
    static async updateStudentApplicableFee(data) {
        const { id, feePaid, orderId, lastPaidDate, setFullAmount = false, feeAmount = 0 } = data;

        let query;
        let params;

        if (setFullAmount) {
            query = `UPDATE student_applicable_fee 
                     SET fee_paid = ?, order_id = ?, last_paid_date = ? 
                     WHERE id = ?`;
            params = [feeAmount, orderId, lastPaidDate, id];
        } else {
            query = `UPDATE student_applicable_fee 
                     SET fee_paid = (fee_paid + ?), order_id = ?, last_paid_date = ? 
                     WHERE id = ?`;
            params = [feePaid, orderId, lastPaidDate, id];
        }

        const [result] = await db.query(query, params);
        return result;
    }

    /**
     * Update fine amount in student applicable fee
     */
    static async updateFineInApplicableFee(data) {
        const { studId, clgId, corId, branchId, semId, fineAppliedOn, finePaidAmt } = data;

        const [result] = await db.query(
            `UPDATE student_applicable_fee 
             SET \`fine paid\` = (\`fine paid\` + ?) 
             WHERE stud_id = ? AND clg_id = ? AND cor_id = ? 
                   AND branch_id = ? AND sem_id = ? AND fee_type = ?`,
            [finePaidAmt, studId, clgId, corId, branchId, semId, fineAppliedOn]
        );

        return result;
    }

    /**
     * Update scholarship log
     */
    static async updateScholarshipLog(data) {
        const { id, paidAmt, paymentDoneOn, paymentDone = null, finePaid = null } = data;

        let query = `UPDATE applied_scholarship_log SET paid_amt = ?, payment_done_on = ?`;
        let params = [paidAmt, paymentDoneOn];

        if (paymentDone !== null) {
            query += `, payment_done = ?`;
            params.push(paymentDone);
        }

        if (finePaid !== null) {
            query += `, fine_paid = ?`;
            params.push(finePaid);
        }

        query += ` WHERE id = ?`;
        params.push(id);

        const [result] = await db.query(query, params);
        return result;
    }

    /**
     * Get scholarship log by student and semester
     */
    static async getScholarshipLogByStudentAndSem(studentId, semId) {
        const [rows] = await db.query(
            `SELECT * FROM applied_scholarship_log 
             WHERE stud_id = ? AND sem_id = ?`,
            [studentId, semId]
        );
        return rows;
    }

    /**
     * Mark scholarship log as payment done
     */
    static async markScholarshipLogPaymentDone(id) {
        const [result] = await db.query(
            `UPDATE applied_scholarship_log SET payment_done = '1' WHERE id = ?`,
            [id]
        );
        return result;
    }

    /**
     * Get additional fee details
     */
    static async getAdditionalFeeDetails(data) {
        const { studId, clgId, corId, branchId, semId, additionalFee } = data;

        const [rows] = await db.query(
            `SELECT *, \`fine paid\` as paid_fine FROM student_applicable_fee 
             WHERE stud_id = ? AND clg_id = ? AND cor_id = ? 
                   AND branch_id = ? AND sem_id = ? AND fee_type = ?`,
            [studId, clgId, corId, branchId, semId, additionalFee]
        );

        return rows[0] || null;
    }

    /**
     * Update additional fee
     */
    static async updateAdditionalFee(data) {
        const { studId, clgId, corId, branchId, semId, additionalFee, paidAmt, finePaid, paidDate, orderId } = data;

        const [result] = await db.query(
            `UPDATE student_applicable_fee 
             SET fee_paid = (fee_paid + ?), \`fine paid\` = ?, 
                 last_paid_date = ?, order_id = ? 
             WHERE stud_id = ? AND clg_id = ? AND cor_id = ? 
                   AND branch_id = ? AND sem_id = ? AND fee_type = ?`,
            [paidAmt, finePaid, paidDate, orderId, studId, clgId, corId, branchId, semId, additionalFee]
        );

        return result;
    }

    /**
     * Get installment details
     */
    static async getInstallmentDetails(installmentId, studId) {
        const [rows] = await db.query(
            `SELECT * FROM installment_details WHERE id = ? AND stud_id = ?`,
            [installmentId, studId]
        );
        return rows[0] || null;
    }

    /**
     * Update installment details after payment
     */
    static async updateInstallmentDetails(data) {
        const { installmentId, payableAmount, totalFine, paidDate, orderId, duration } = data;

        const [result] = await db.query(
            `UPDATE installment_details 
             SET paid_amount = ?, paid_fine = ?, paid_date = ?, 
                 trans_status = 'SUCCESS', paid_status = '1', 
                 oid = ?, fine_duration = ? 
             WHERE id = ?`,
            [payableAmount, totalFine, paidDate, orderId, duration, installmentId]
        );

        return result;
    }

    /**
     * Check if all installments are complete
     */
    static async checkInstallmentsComplete(applInstId) {
        const [rows] = await db.query(
            `SELECT * FROM installment_details 
             WHERE appl_inst_id = ? 
             AND (CAST(payable_amount AS UNSIGNED) > CAST(paid_amount AS UNSIGNED) 
                  OR paid_amount IS NULL OR paid_amount = '')`,
            [applInstId]
        );
        return rows.length === 0;
    }

    /**
     * Update all applicable fees to fully paid
     */
    static async updateAllApplicableFeesFullyPaid(data) {
        const { studId, semId, paidDate, orderId } = data;

        const [result] = await db.query(
            `UPDATE student_applicable_fee 
             SET fee_paid = fee_amount, last_paid_date = ?, order_id = ? 
             WHERE stud_id = ? AND sem_id = ?`,
            [paidDate, orderId, studId, semId]
        );

        return result;
    }

    /**
     * Get total paid fine from installments
     */
    static async getTotalPaidFineFromInstallments(studId, applInstId) {
        const [rows] = await db.query(
            `SELECT COALESCE(SUM(CAST(paid_fine AS UNSIGNED)), 0) as paid_fine 
             FROM installment_details 
             WHERE stud_id = ? AND appl_inst_id = ?`,
            [studId, applInstId]
        );
        return rows[0]?.paid_fine || 0;
    }

    /**
     * Update installment fee fine paid
     */
    static async updateInstallmentFeeFine(data) {
        const { studId, semId, finePaid } = data;

        const [result] = await db.query(
            `UPDATE student_applicable_fee 
             SET \`fine paid\` = ? 
             WHERE stud_id = ? AND sem_id = ? AND fee_type = 'installment_fee'`,
            [finePaid, studId, semId]
        );

        return result;
    }

    /**
     * MAIN METHOD: Process successful payment for payment_type = 1
     * This orchestrates all the updates needed after a successful payment
     */
    static async processPaymentType1Success(data) {
        const {
            orderId,
            studId,
            txnAmt,
            totalCurrentTutionFees,
            totalPaidAmt,
            receiveableScholarship,
            ipAddress,
            paymentStatus = 1
        } = data;

        const currentTimestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
        const currentDate = new Date().toISOString().slice(0, 10);

        try {
            // 1. Update stud_current_sem_year
            await this.updateStudCurrentSemYear({
                studId,
                txnAmt,
                totalCurrentTutionFees,
                totalPaidAmt,
                receiveableScholarship
            });

            // 2. Update fee_payment_transaction_scholarship_details
            await this.updateScholarshipDetailsAfterPayment({
                orderId,
                studId,
                ipAddress,
                paymentStatus
            });

            // 3. Check and update applied_scholarship_log
            await this.updateAppliedScholarshipLogPaymentDone(studId);

            // 4. Get payment details
            const payDetails = await this.getPaymentScholarshipDetailsByOrderAndStudent(orderId, studId);
            if (!payDetails) {
                throw new Error('Payment details not found');
            }

            const {
                clg_id: clgId,
                cor_id: corId,
                sem_id: semId,
                branch_id: branchId,
                paid_amt: paidAmt,
                fine_amt: fineAmt,
                fine_applied_on: fineAppliedOn,
                installment_id: installmentId,
                tran_done_date: paidDate,
                additional_fee: additionalFee,
                additional_fee_amt: additionalFeeAmt,
                total_fine: totalFine,
                duration,
                fine_type: fineType
            } = payDetails;

            // 5. Get applicable fee totals
            const feeSum = await this.getStudentApplicableFeeSum({
                studId, clgId, corId, branchId, semId
            });

            let { total_applicable_fee: totalApplicableFee, total_paid_fee: totalPaidFee } = feeSum;
            totalApplicableFee = parseInt(totalApplicableFee) || 0;
            totalPaidFee = parseInt(totalPaidFee) || 0;

            let remainingAmtFromPaidFee = parseInt(paidAmt) || 0;

            // 6. Get fees to update
            const feesToUpdate = await this.getStudentApplicableFeesToUpdate({
                studId, clgId, corId, branchId, semId
            });

            const totalSumPaid = totalPaidFee + parseInt(paidAmt);

            // Check if it's regular payment (no installment, no additional fee)
            if ((!installmentId || installmentId === 0 || installmentId === '') && (!additionalFee || additionalFee === '')) {

                // Get pending scholarship logs
                const scholarshipLogs = await this.getPendingScholarshipLogs({
                    studId, clgId, corId, branchId, semId
                });

                let scholarshipId = null;
                for (const log of scholarshipLogs) {
                    const receiveableSchol = parseInt(log.reciveable_scholarship) || 0;
                    totalApplicableFee += receiveableSchol;
                    scholarshipId = log.id;
                }

                const scholarshipLogCount = scholarshipLogs.length;

                if (totalSumPaid >= totalApplicableFee) {
                    // Full payment - update all fees to full amount
                    const finePaidAmt = totalSumPaid - totalApplicableFee;

                    for (const fee of feesToUpdate) {
                        if (fee.fee_type !== 'scholarship_fee') {
                            await this.updateStudentApplicableFee({
                                id: fee.id,
                                feePaid: fee.fee_amount,
                                orderId,
                                lastPaidDate: paidDate || currentTimestamp,
                                setFullAmount: true,
                                feeAmount: fee.fee_amount
                            });
                        }

                        if (fee.fee_type === 'scholarship_fee' && scholarshipLogCount > 0) {
                            const pendingScholarshipLogs = await this.getPendingScholarshipLogs({
                                studId, clgId, corId, branchId, semId
                            });

                            for (const scholLog of pendingScholarshipLogs) {
                                const receiveableSchol = parseInt(scholLog.reciveable_scholarship) || 0;
                                const scholarshipFeePaid = parseInt(scholLog.fee_paid) || 0;
                                const scholarshipAmountUpdate = scholarshipFeePaid + receiveableSchol;

                                await this.updateStudentApplicableFee({
                                    id: fee.id,
                                    feePaid: receiveableSchol,
                                    orderId,
                                    lastPaidDate: paidDate || currentTimestamp
                                });

                                await this.updateScholarshipLog({
                                    id: scholLog.id,
                                    paidAmt: scholarshipAmountUpdate,
                                    paymentDoneOn: paidDate || currentTimestamp,
                                    paymentDone: '1'
                                });
                            }
                        }
                    }

                    // Update fine amount
                    const appliedOn = fineAppliedOn || 'tution_fee';
                    await this.updateFineInApplicableFee({
                        studId, clgId, corId, branchId, semId,
                        fineAppliedOn: appliedOn,
                        finePaidAmt
                    });

                    // Update scholarship log fine if applicable
                    if (fineAppliedOn === 'scholarship_fee' && scholarshipId) {
                        await this.updateScholarshipLog({
                            id: scholarshipId,
                            paidAmt: 0, // Not updating paid_amt here
                            paymentDoneOn: paidDate || currentTimestamp,
                            finePaid: finePaidAmt
                        });
                    }

                    // Check and mark scholarship as complete
                    const scholLogs = await this.getScholarshipLogByStudentAndSem(studId, semId);
                    for (const log of scholLogs) {
                        const receiveableSchol = parseInt(log.reciveable_scholarship) || 0;
                        const scholPaidAmt = parseInt(log.paid_amt) || 0;
                        const scholApplicableFine = parseInt(log.applicable_fine) || 0;
                        const scholFinePaid = parseInt(log.fine_paid) || 0;
                        const totalScholPaid = scholPaidAmt + scholFinePaid;
                        const totalScholarshipAmt = receiveableSchol + scholApplicableFine;

                        if (totalScholPaid >= totalScholarshipAmt) {
                            await this.markScholarshipLogPaymentDone(log.id);
                        }
                    }

                } else {
                    // Partial payment - distribute among fees
                    for (const fee of feesToUpdate) {
                        if (remainingAmtFromPaidFee <= 0) break;

                        let payingAmt = 0;
                        const applicable = parseInt(fee.fee_amount) || 0;
                        const paid = parseInt(fee.fee_paid) || 0;
                        const remaining = applicable - paid;

                        if (fee.fee_type !== 'scholarship_fee') {
                            if (remainingAmtFromPaidFee >= remaining) {
                                payingAmt = remaining;
                            } else {
                                payingAmt = remainingAmtFromPaidFee;
                            }

                            await this.updateStudentApplicableFee({
                                id: fee.id,
                                feePaid: payingAmt,
                                orderId,
                                lastPaidDate: paidDate || currentTimestamp
                            });
                        }

                        if (fee.fee_type === 'scholarship_fee' && scholarshipLogCount > 0) {
                            const pendingScholarshipLogs = await this.getPendingScholarshipLogs({
                                studId, clgId, corId, branchId, semId
                            });

                            let payingAmtScholarship = remainingAmtFromPaidFee;

                            for (const scholLog of pendingScholarshipLogs) {
                                if (payingAmtScholarship <= 0) break;

                                const receiveableSchol = parseInt(scholLog.reciveable_scholarship) || 0;

                                if (payingAmtScholarship >= receiveableSchol) {
                                    payingAmt = receiveableSchol;
                                    await this.updateScholarshipLog({
                                        id: scholLog.id,
                                        paidAmt: payingAmt,
                                        paymentDoneOn: paidDate || currentTimestamp,
                                        paymentDone: '1'
                                    });
                                } else {
                                    payingAmt = payingAmtScholarship;
                                    await this.updateScholarshipLog({
                                        id: scholLog.id,
                                        paidAmt: payingAmt,
                                        paymentDoneOn: paidDate || currentTimestamp
                                    });
                                }

                                await this.updateStudentApplicableFee({
                                    id: fee.id,
                                    feePaid: payingAmt,
                                    orderId,
                                    lastPaidDate: paidDate || currentTimestamp
                                });

                                payingAmtScholarship -= receiveableSchol;
                            }
                        }

                        remainingAmtFromPaidFee -= payingAmt;
                    }

                    // Check scholarship completion
                    const scholLogs = await this.getScholarshipLogByStudentAndSem(studId, semId);
                    for (const log of scholLogs) {
                        const receiveableSchol = parseInt(log.reciveable_scholarship) || 0;
                        const scholPaidAmt = parseInt(log.paid_amt) || 0;
                        const scholApplicableFine = parseInt(log.applicable_fine) || 0;
                        const scholFinePaid = parseInt(log.fine_paid) || 0;
                        const totalScholPaid = scholPaidAmt + scholFinePaid;
                        const totalScholarshipAmt = receiveableSchol + scholApplicableFine;

                        if (totalScholPaid >= totalScholarshipAmt) {
                            await this.markScholarshipLogPaymentDone(log.id);
                        }
                    }
                }

            } else if (additionalFee && additionalFee !== '') {
                // Additional fee payment
                const addFeeDetails = await this.getAdditionalFeeDetails({
                    studId, clgId, corId, branchId, semId, additionalFee
                });

                if (addFeeDetails) {
                    const feeAmount = parseInt(addFeeDetails.fee_amount) || 0;
                    const finePaid = parseInt(paidAmt) > feeAmount ? parseInt(paidAmt) - feeAmount : 0;

                    await this.updateAdditionalFee({
                        studId, clgId, corId, branchId, semId,
                        additionalFee,
                        paidAmt: parseInt(paidAmt),
                        finePaid,
                        paidDate: paidDate || currentTimestamp,
                        orderId
                    });
                }

            } else {
                // Installment payment
                const installDetails = await this.getInstallmentDetails(installmentId, studId);

                if (installDetails) {
                    const payableInstallment = installDetails.payable_amount;
                    const applInstId = installDetails.appl_inst_id;

                    await this.updateInstallmentDetails({
                        installmentId,
                        payableAmount: payableInstallment,
                        totalFine: totalFine || 0,
                        paidDate: paidDate || currentTimestamp,
                        orderId,
                        duration: duration || ''
                    });

                    // Check if all installments are complete
                    const allComplete = await this.checkInstallmentsComplete(applInstId);

                    if (allComplete) {
                        await this.updateAllApplicableFeesFullyPaid({
                            studId,
                            semId,
                            paidDate: paidDate || currentTimestamp,
                            orderId
                        });

                        // Update fine paid from installments
                        const totalInstallFinePaid = await this.getTotalPaidFineFromInstallments(studId, applInstId);
                        await this.updateInstallmentFeeFine({
                            studId,
                            semId,
                            finePaid: totalInstallFinePaid
                        });
                    }
                }
            }

            return { success: true, message: 'Payment processed successfully' };

        } catch (error) {
            console.error('Error processing payment type 1:', error);
            throw error;
        }
    }

    // PaymentModel.js — read-only, mirrors get_month_wise_payment() logic exactly
    // static async getRpsFeeSplit(studId, clgId, corId, branchId, semYearId, selectedMonths) {
    //     const today = new Date();

    //     console.log('[RPS FeeSplit] INPUT →', { studId, clgId, corId, branchId, semYearId, selectedMonths });

    //     const [[{ all_tution_fee_count }]] = await db.query(
    //         `SELECT COUNT(DISTINCT due_date) AS all_tution_fee_count
    //  FROM rps_student_fees_structure
    //  WHERE stud_id=? AND clg_id=? AND cor_id=? AND branch_id=? AND fee_type_id=5`,
    //         [studId, clgId, corId, branchId]
    //     );
    //     console.log('[RPS FeeSplit] Q1 all_tution_fee_count →', all_tution_fee_count, '| params:', [studId, clgId, corId, branchId]);

    //     const isDiscountOnTuition = all_tution_fee_count > 0 && selectedMonths.length === all_tution_fee_count;
    //     console.log('[RPS FeeSplit] isDiscountOnTuition →', isDiscountOnTuition, `(selectedMonths.length=${selectedMonths.length})`);

    //     const [discRows] = await db.query(
    //         `SELECT id FROM rps_student_fees_structure
    //  WHERE stud_id=? AND clg_id=? AND cor_id=? AND branch_id=? AND sem_id=? AND discount_id != 0`,
    //         [studId, clgId, corId, branchId, semYearId]
    //     );
    //     console.log('[RPS FeeSplit] Q2 discRows →', discRows.length, 'rows | params:', [studId, clgId, corId, branchId, semYearId]);

    //     const hasAlreadyDiscountApplied = discRows.length > 0;
    //     console.log('[RPS FeeSplit] hasAlreadyDiscountApplied →', hasAlreadyDiscountApplied);

    //     const [[firstDueRow]] = await db.query(
    //         `SELECT due_date FROM rps_student_fees_structure
    //  WHERE stud_id=? AND fee_type_id=5 ORDER BY due_date ASC LIMIT 1`,
    //         [studId]
    //     );
    //     console.log('[RPS FeeSplit] Q3 firstDueRow →', firstDueRow, '| params:', [studId]);

    //     const isDiscountApplicableAfterFirstDueDate = !(new Date(firstDueRow?.due_date) >= today);
    //     console.log('[RPS FeeSplit] isDiscountApplicableAfterFirstDueDate →', isDiscountApplicableAfterFirstDueDate,
    //         `(firstDueDate=${firstDueRow?.due_date}, today=${today.toISOString()})`);

    //     const [paidRows] = await db.query(
    //         `SELECT id FROM rps_student_fees_structure
    //  WHERE stud_id=? AND clg_id=? AND cor_id=? AND branch_id=? AND paid_amount > 0`,
    //         [studId, clgId, corId, branchId]
    //     );
    //     console.log('[RPS FeeSplit] Q4 paidRows →', paidRows.length, 'rows | params:', [studId, clgId, corId, branchId]);

    //     const hasAnyPaymentDone = paidRows.length > 0;
    //     console.log('[RPS FeeSplit] hasAnyPaymentDone →', hasAnyPaymentDone);

    //     const deadline = new Date(`${today.getFullYear()}-06-10`);
    //     let CMSirDiscountOnTution = today < deadline && Number(corId) === 55;
    //     if (hasAnyPaymentDone) CMSirDiscountOnTution = false;
    //     console.log('[RPS FeeSplit] CMSirDiscountOnTution →', CMSirDiscountOnTution, `(deadline=${deadline.toISOString()}, corId=${corId})`);

    //     let academicFee = 0, hostelFee = 0, transportFee = 0, totalFine = 0;

    //     for (const { due_on, month_year } of selectedMonths) {
    //         const dueDate = new Date(due_on).toISOString().slice(0, 10);
    //         console.log(`[RPS FeeSplit] --- Processing month: due_on=${due_on} → dueDate=${dueDate}, month_year='${month_year}' ---`);

    //         const [rows] = await db.query(
    //             `SELECT s.*, fm.q1_fine AS fine_amount
    //      FROM rps_student_fees_structure s
    //      LEFT JOIN fine_master fm ON fm.clg_id=s.clg_id AND fm.cor_id=s.cor_id
    //        AND fm.branch_id=s.branch_id AND s.sem_id=fm.sem_id
    //      WHERE s.due_date=? AND s.month_year=? AND s.stud_id=? AND s.clg_id=?
    //        AND s.cor_id=? AND s.branch_id=? AND s.sem_id=?
    //        AND s.total_amount != s.paid_amount AND s.total_amount > 0
    //      GROUP BY s.id ORDER BY s.fee_type_id ASC`,
    //             [dueDate, month_year, studId, clgId, corId, branchId, semYearId]
    //         );
    //         console.log(`[RPS FeeSplit] Q5 rows for ${month_year} →`, rows.length, 'rows | params:',
    //             [dueDate, month_year, studId, clgId, corId, branchId, semYearId]);
    //         if (rows.length === 0) {
    //             console.log(`[RPS FeeSplit] ⚠️  NO ROWS MATCHED for due_date='${dueDate}' month_year='${month_year}' — check format/timezone mismatch against DB`);
    //         }

    //         let monthlyFine = 0;

    //         for (const row of rows) {
    //             const feeTypeId = Number(row.fee_type_id);
    //             const total = parseFloat(row.total_amount);
    //             const paid = parseFloat(row.paid_amount);
    //             const remainingRaw = Math.round((total - paid) * 100) / 100;

    //             console.log(`[RPS FeeSplit]   row id=${row.id} fee_type_id=${feeTypeId} total=${total} paid=${paid} remainingRaw=${remainingRaw} is_fine_applicable=${row.is_fine_applicable} fine_amount=${row.fine_amount}`);

    //             if (row.is_fine_applicable == 1 && feeTypeId === 5 && totalFine < 1 &&
    //                 remainingRaw > 1 && !CMSirDiscountOnTution) {
    //                 const dueDateObj = new Date(dueDate);
    //                 if (today > dueDateObj) {
    //                     const fineDays = Math.floor((today - dueDateObj) / 86400000);
    //                     monthlyFine = parseFloat(row.fine_amount || 0) * fineDays;
    //                     console.log(`[RPS FeeSplit]   → fine applies: fineDays=${fineDays}, monthlyFine=${monthlyFine}`);
    //                 }
    //             }

    //             const remainingAmount = Math.ceil(total - paid);
    //             if (remainingAmount <= 0) {
    //                 console.log(`[RPS FeeSplit]   → skipped (remainingAmount=${remainingAmount} <= 0)`);
    //                 continue;
    //             }

    //             let payable;
    //             if (isDiscountOnTuition && feeTypeId === 5 && !hasAlreadyDiscountApplied &&
    //                 (isDiscountApplicableAfterFirstDueDate || CMSirDiscountOnTution) &&
    //                 totalFine < 1 && monthlyFine < 1) {
    //                 const discount = Math.round(remainingAmount * 0.05 * 100) / 100;
    //                 payable = Math.round((remainingAmount - discount) * 100) / 100;
    //                 console.log(`[RPS FeeSplit]   → discount applied: discount=${discount}, payable=${payable}`);
    //             } else {
    //                 payable = remainingAmount;
    //             }

    //             if (feeTypeId === 27 || feeTypeId === 29) {
    //                 hostelFee += payable;
    //                 console.log(`[RPS FeeSplit]   → added to hostelFee: +${payable} (running=${hostelFee})`);
    //             } else if (feeTypeId === 28) {
    //                 transportFee += payable;
    //                 console.log(`[RPS FeeSplit]   → added to transportFee: +${payable} (running=${transportFee})`);
    //             } else {
    //                 academicFee += payable;
    //                 console.log(`[RPS FeeSplit]   → added to academicFee: +${payable} (running=${academicFee})`);
    //             }
    //         }

    //         totalFine += monthlyFine;
    //         academicFee += monthlyFine;
    //         console.log(`[RPS FeeSplit] --- Month done: monthlyFine=${monthlyFine}, totalFine=${totalFine} ---`);
    //     }

    //     academicFee = Math.ceil(academicFee);
    //     hostelFee = Math.ceil(hostelFee);
    //     transportFee = Math.ceil(transportFee);

    //     const result = { academicFee, hostelFee, transportFee, totalFine, totalPayable: academicFee + hostelFee + transportFee };
    //     console.log('[RPS FeeSplit] FINAL RESULT →', result);

    //     return result;
    // }
}

module.exports = PaymentModel;