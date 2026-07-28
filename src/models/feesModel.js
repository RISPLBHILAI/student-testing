/**
 * Fees Model - SRGI Digi Campus
 * Handles all fee-related database operations and calculations
 * Converted from PHP to Node.js for real-time fee status
 */

const db = require("../../../shared/db/mysql");

class FeesModel {

    // ==================== HELPER FUNCTIONS ====================

    /**
     * Convert date string to Y-m-d format
     */
    static convertToYMDFormat(dateString) {
        if (!dateString || dateString === '0000-00-00' || dateString === '0000-00-00 00:00:00') {
            return null;
        }

        try {
            // Try parsing with different formats
            let date;

            // Check if it's already in ISO format
            if (dateString instanceof Date) {
                date = new Date(dateString);
            } else if (dateString.includes('/')) {
                // Handle d/m/Y or m/d/Y formats
                const parts = dateString.split(' ')[0].split('/');
                if (parts[0].length === 4) {
                    // Y/m/d or Y/d/m
                    date = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
                } else if (parseInt(parts[0]) > 12) {
                    // d/m/Y format
                    date = new Date(parts[2], parseInt(parts[1]) - 1, parts[0]);
                } else {
                    // m/d/Y format
                    date = new Date(parts[2], parseInt(parts[0]) - 1, parts[1]);
                }
            } else if (dateString.includes('-')) {
                // Handle Y-m-d or d-m-Y formats
                const parts = dateString.split(' ')[0].split('-');
                if (parts[0].length === 4) {
                    // Y-m-d format
                    date = new Date(parts[0], parseInt(parts[1]) - 1, parts[2]);
                } else {
                    // d-m-Y format
                    date = new Date(parts[2], parseInt(parts[1]) - 1, parts[0]);
                }
            } else {
                date = new Date(dateString);
            }

            if (isNaN(date.getTime())) {
                return null;
            }

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');

            return `${year}-${month}-${day}`;
        } catch (error) {
            console.error('Date conversion error:', error);
            return null;
        }
    }

    /**
     * Get today's date in Y-m-d format
     */
    static getTodayDate() {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Get the greater (later) of two dates
     */
    static getGreaterDate(date1, date2) {
        if (!date1 || !date2) return null;

        const d1 = new Date(date1);
        const d2 = new Date(date2);

        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
            return 'invalid date';
        }

        return d1 >= d2 ? date1 : date2;
    }

    /**
     * Get the lesser (earlier) of two dates
     */
    static getLesserDate(date1, date2) {
        if (!date1 || !date2) return null;

        const d1 = new Date(date1);
        const d2 = new Date(date2);

        if (isNaN(d1.getTime()) || isNaN(d2.getTime())) {
            return null;
        }

        return d1 <= d2 ? date1 : date2;
    }

    /**
     * Calculate days difference between two dates
     */
    static getDaysDifference(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);
        const diffTime = end.getTime() - start.getTime();
        return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    }

    /**
     * Format fee name for display
     */
    static formatFeeName(feeType) {
        if (!feeType) return '';
        return feeType
            .replace(/_/g, ' ')
            .replace(/\b\w/g, char => char.toUpperCase());
    }

    // ==================== FINE CALCULATION FUNCTIONS ====================

    /**
     * Calculate daily fine
     */
    static calculateFine(finePerDay, startDate, endDate, fineAppliedOn) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return {
                fine_amt: 0,
                duration: 0,
                total_fine: 0,
                type: 'daily',
                fine_applied_on: fineAppliedOn
            };
        }

        const daysDiff = this.getDaysDifference(startDate, endDate);

        if (daysDiff <= 0) {
            return {
                fine_amt: finePerDay,
                duration: 0,
                total_fine: 0,
                type: 'daily',
                fine_applied_on: fineAppliedOn
            };
        }

        const totalFine = finePerDay * daysDiff;

        return {
            fine_amt: finePerDay,
            duration: daysDiff,
            total_fine: totalFine,
            type: 'daily',
            fine_applied_on: fineAppliedOn,
            finestart_date: startDate,
            fineend_date: endDate
        };
    }

    /**
     * Calculate monthly fine (for RCST/RISM colleges)
     */
    static calculateFineRcstRism(startDate, endDate, fineAppliedOn) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return {
                fine_amt: 0,
                duration: 0,
                total_fine: 0,
                type: 'monthly',
                fine_applied_on: fineAppliedOn
            };
        }

        if (end <= start) {
            return {
                fine_amt: 0,
                duration: 0,
                total_fine: 0,
                type: 'monthly',
                fine_applied_on: fineAppliedOn,
                finestart_date: startDate,
                fineend_date: endDate,
                message: "No fine is applicable as the end date is the same or earlier than the start date."
            };
        }

        // Calculate total months
        const startYear = start.getFullYear();
        const endYear = end.getFullYear();
        const startMonth = start.getMonth();
        const endMonth = end.getMonth();
        const startDay = start.getDate();
        const endDay = end.getDate();

        let totalMonths = ((endYear - startYear) * 12) + (endMonth - startMonth);

        // Include last partial month if it's a full month or more
        if (endDay > startDay) {
            totalMonths++;
        }

        if (totalMonths <= 0) {
            return {
                fine_amt: 0,
                duration: this.getDaysDifference(startDate, endDate),
                total_fine: 0,
                type: 'monthly',
                fine_applied_on: fineAppliedOn,
                finestart_date: startDate,
                fineend_date: endDate,
                message: "No fine is applicable as the duration is less than a full month."
            };
        }

        const finePerMonth = 750;
        const fineAmount = totalMonths * finePerMonth;
        const durationDays = this.getDaysDifference(startDate, endDate);

        return {
            fine_amt: fineAmount,
            duration: durationDays,
            total_fine: fineAmount,
            type: 'monthly',
            finestart_date: startDate,
            fineend_date: endDate,
            fine_applied_on: fineAppliedOn
        };
    }

    /**
     * Calculate installment fine
     */
    static calculateFineInstallment(startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return null;
        }

        const daysDifference = this.getDaysDifference(startDate, endDate);

        if (daysDifference <= 0) {
            return 0;
        }

        if (daysDifference > 10) {
            return 100 + (25 * (daysDifference - 10));
        } else {
            return 10 * daysDifference;
        }
    }

    /**
     * Calculate monthly fine
     */
    static calculateFineMonthly(fineAmt, startDate, endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { total_fine: 0, months: 0 };
        }

        const monthsDiff = (end.getFullYear() - start.getFullYear()) * 12 +
            (end.getMonth() - start.getMonth());

        if (monthsDiff <= 0) {
            return { total_fine: 0, months: 0 };
        }

        return {
            total_fine: fineAmt * monthsDiff,
            months: monthsDiff
        };
    }

    // ==================== DATABASE QUERY FUNCTIONS ====================

    /**
     * Get student current semester data
     */
    static async getStudentCurrentSemester(studId) {
        const sql = `
           SELECT
    tblstud_profile.*,
    stud_current_sem_year.sem_year_id,
    stud_current_sem_year.*,
    tblcollege.short_name as clg_name,
    tblcourse.cor_name,
    tblbranch_subject.branch_sub_name as branch_name
FROM
    tblstud_profile,
    stud_current_sem_year
    JOIN tblcollege ON tblcollege.id = stud_current_sem_year.clg_id
    JOIN tblcourse ON tblcourse.id = stud_current_sem_year.cor_id
    JOIN tblbranch_subject ON tblbranch_subject.id = stud_current_sem_year.branch_id
    
WHERE
    tblstud_profile.id = ?  AND tblstud_profile.id = stud_current_sem_year.stud_id;
        `;

        const [rows] = await db.query(sql, [studId]);
        return rows[0] || null;
    }

    /**
     * Get academic paid date
     */
    static async getAcademicPaidDate(studId, clgId, corId, branchId, semId) {
        const sql = `
            SELECT 
                DATE(last_paid_date) AS last_academic_paid_date,
                due_date AS academic_due_date
            FROM student_applicable_fee
            WHERE stud_id = ?
            AND clg_id = ?
            AND cor_id = ?
            AND branch_id = ?
            AND sem_id = ?
            AND fee_category NOT IN (20, 17, 18, 11, 10)
            ORDER BY last_paid_date DESC
            LIMIT 1;
        `;

        const [rows] = await db.query(sql, [studId, clgId, corId, branchId, semId]);
        return rows[0] || { last_academic_paid_date: null, academic_due_date: null };
    }

    /**
     * Get last paid date
     */
    static async getLastPaidDate(studId, semId) {
        const sql = `
            SELECT txn_date 
            FROM fee_payment_transaction_done, fee_payment_transaction_scholarship_details 
            WHERE fee_payment_transaction_done.stud_id = ? 
            AND fee_payment_transaction_done.sem_id = ? 
            AND fee_payment_transaction_scholarship_details.order_id = fee_payment_transaction_done.order_id 
            ORDER BY fee_payment_transaction_done.id DESC 
            LIMIT 1
        `;

        const [rows] = await db.query(sql, [studId, semId]);

        if (rows[0] && rows[0].txn_date) {
            return this.convertToYMDFormat(rows[0].txn_date);
        }
        return null;
    }

    /**
     * Get scholarship data
     */
    static async getScholarshipData(studId, semId) {
        const sql = `
            SELECT *, due_date as sc_due_date 
            FROM applied_scholarship_log 
            WHERE stud_id = ? AND sem_id = ?
        `;

        const [rows] = await db.query(sql, [studId, semId]);
        return rows;
    }

    /**
     * Get installment data
     */
    static async getInstallmentData(studId) {
        // First get current semester info
        const currentSql = `
            SELECT clg_id, cor_id, branch_id, sem_year_id 
            FROM stud_current_sem_year 
            WHERE stud_id = ?
        `;

        const [currentRows] = await db.query(currentSql, [studId]);

        if (!currentRows[0]) {
            return [];
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = currentRows[0];

        const sql = `
            SELECT
                installment_details.*,
                applied_installment.total_amount,
                applied_installment.total_amt_with_interest,
                applied_installment.fine_before_installment
            FROM installment_details, applied_installment
            WHERE installment_details.stud_id = ?
            AND applied_installment.clg_id = ?
            AND applied_installment.cor_id = ?
            AND applied_installment.bra_id = ?
            AND applied_installment.sem_id = ?
            AND applied_installment.id = installment_details.appl_inst_id
            AND applied_installment.fee_type = '1'
        `;

        const [rows] = await db.query(sql, [studId, clg_id, cor_id, branch_id, sem_year_id]);
        return rows;
    }

    /**
     * Get additional fee data
     */
    static async getAdditionalFee(studId, clgId, corId, branchId, semId) {
        const sql = `
            SELECT student_applicable_fee.*, 
                   student_applicable_fee.\`fine paid\` as fine_paid 
            FROM student_applicable_fee 
            WHERE active_state = '1' 
            AND stud_id = ? 
            AND clg_id = ? 
            AND cor_id = ? 
            AND branch_id = ? 
            AND sem_id = ? 
            AND fee_category IN (11)
        `;

        const [rows] = await db.query(sql, [studId, clgId, corId, branchId, semId]);

        const additionalFeeArr = {
            total_additional_fee: 0,
            total_additional_remaining: 0,
            total_additional_paid: 0,
            total_additonal_fine: 0,
            fee_details_arr: [],
            due_date: ''
        };

        const today = this.getTodayDate();
        let totalFee = 0;
        let totalPaid = 0;
        let totalFine = 0;

        for (const row of rows) {
            let feeAmount = parseInt(row.fee_amount) || 0;
            let feePaid = parseInt(row.fee_paid) || 0;
            const feeType = row.fee_type;
            const feeId = row.id;
            const feeType1 = this.formatFeeName(feeType);
            let dueDate = row.due_date;
            const fineAmt = row.fine_amt;
            const fineType = row.fine_type;
            const finePaid = parseInt(row.fine_paid) || 0;

            if (feePaid > feeAmount) {
                feePaid = feeAmount;
            }

            totalPaid += feePaid + finePaid;
            totalFee += feeAmount;

            dueDate = dueDate && dueDate !== '0000-00-00 00:00:00' && dueDate !== '0000-00-00'
                ? this.convertToYMDFormat(dueDate)
                : '0000-00-00';

            let fineAmount = 0;

            if (feePaid >= feeAmount) {
                additionalFeeArr.fee_details_arr.push({
                    fee_type: feeType,
                    fee_type_name: feeType1,
                    fee_amount: feeAmount,
                    fee_paid: feePaid,
                    due_date: dueDate,
                    fine_paid: finePaid,
                    fine_applicable: finePaid,
                    fee_id: feeId
                });
                totalFine += finePaid;
            } else {
                if (fineAmt > 0) {
                    const greaterDate = this.getGreaterDate(dueDate, today);

                    if (today === greaterDate) {
                        let fineData;
                        if (fineType === 'monthly') {
                            fineData = this.calculateFineMonthly(fineAmt, dueDate, today);
                        } else if (fineType === 'Daily') {
                            fineData = this.calculateFine(fineAmt, dueDate, greaterDate, 'additional_fee');
                        }
                        fineAmount = fineData?.total_fine || 0;
                        totalFine += fineAmount;
                    }
                    totalFee += fineAmount;
                }

                additionalFeeArr.fee_details_arr.push({
                    fee_type: feeType1,
                    fee_amount: feeAmount,
                    fee_paid: feePaid,
                    due_date: dueDate,
                    fine_applicable: fineAmount,
                    fine_paid: 0,
                    fee_id: feeId
                });
            }

            additionalFeeArr.due_date = dueDate;
        }

        additionalFeeArr.total_additional_fee = totalFee;
        additionalFeeArr.total_additional_paid = totalPaid;
        additionalFeeArr.total_additional_remaining = Math.max(0, totalFee - totalPaid);
        additionalFeeArr.total_additonal_fine = totalFine;

        return additionalFeeArr;
    }

    /**
     * Get transport data with fine calculation
     */
    static async getTransportWithFine(studentId) {
        const response = {
            transport_opted: 0,
            transport_data: [],
            total_transport_paid: 0,
            total_transport_fees: 0,
            total_fee_without_fine: 0,
            remaining_fees: 0,
            transport_remaining_fees: 0,
            fine_amount: 0
        };

        const sql = `
            SELECT
                bus_master.bus_id,
                bus_master.bus_number,
                bus_master.bus_name,
                transport_allotment_log.id as allotment_log_id,
                bus_stopage_master.bus_stopage_name,
                bus_type_master.bus_type_id as bus_type,
                bus_type_master.bus_type_name,
                transport_allotment_log.due_date as current_teriff_due_date,
                transport_allotment_log.*
            FROM bus_type_master
            LEFT JOIN bus_master ON bus_master.bus_type = bus_type_master.bus_type_id
            LEFT JOIN transport_allotment_log ON transport_allotment_log.bus_id = bus_master.bus_id
            LEFT JOIN bus_stopage_master ON transport_allotment_log.stopage_id = bus_stopage_master.bus_stopage_id
            WHERE transport_allotment_log.allotment_status = '1' 
            AND transport_allotment_log.stud_id = ?
        `;

        const [transRows] = await db.query(sql, [studentId]);

        if (!transRows || transRows.length === 0) {
            return response;
        }

        const finePerDay = 0.25;
        let totalFeeWithoutFine = 0;
        let totalTransportPaidbase = 0;
        let totalRemaining = 0;
        const transportData = [];

        for (const transRow of transRows) {
            const seatFeesApplied = parseFloat(transRow.seat_fees_applied) || 0;
            let paidFees1 = parseFloat(transRow.paid_fees) || 0;
            const oldFine = parseFloat(transRow.fine_amt) || 0;
            const installmentOpt = parseInt(transRow.instalement_opt_status) || 0;
            const currentTariffDueDate = transRow.current_teriff_due_date;

            // Get last paid date
            const lastPaidSql = `
                SELECT (tran_done_date) as last_paid_date
                FROM transport_payment_tran_details
                WHERE payment_status = '1' AND stud_id = ?
                ORDER BY t_id DESC LIMIT 1
            `;
            const [lastPaidRows] = await db.query(lastPaidSql, [studentId]);
            let lastPaidDate = lastPaidRows[0]?.last_paid_date
                ? this.convertToYMDFormat(lastPaidRows[0].last_paid_date)
                : null;

            let transportFineApplicable = 0;
            let transRemaining = 0;
            let fineAmtUpdated = 0;

            let installmentDetails = [];

            // Non-installment mode
            if (installmentOpt === 0) {
                const seatFeesTotal = seatFeesApplied + oldFine;
                transRemaining = seatFeesTotal - paidFees1;

                if (transRemaining > 0) {
                    const newLastDueDate = new Date(currentTariffDueDate);
                    const todayDate = new Date();
                    const diffDays = Math.floor((todayDate - newLastDueDate) / (1000 * 60 * 60 * 24));
                    const difference = Math.max(0, diffDays);

                    const fineAmtNew = finePerDay * difference;
                    fineAmtUpdated = fineAmtNew;
                    transportFineApplicable = fineAmtNew;
                    transRemaining = transRemaining + fineAmtUpdated;
                } else if (seatFeesTotal > 0 && lastPaidDate) {
                    const newLastDueDate = new Date(currentTariffDueDate);
                    const todayDt = new Date();
                    const lastPaidDt = new Date(lastPaidDate);

                    const lastDateDue = lastPaidDt < todayDt ? lastPaidDt : todayDt;
                    const diffDays = Math.floor((lastDateDue - newLastDueDate) / (1000 * 60 * 60 * 24));
                    const difference = Math.max(0, diffDays);

                    const fineAmtNew = finePerDay * difference;
                    fineAmtUpdated = fineAmtNew + oldFine;
                    transRemaining = transRemaining + fineAmtUpdated;
                }

                transRemaining = Math.max(0, transRemaining);
            }
            // Installment mode
            else {
                const instSql = `
                    SELECT installment_details.*,
                           (SELECT id FROM installment_details
                            WHERE stud_id = ? AND fee_type = '3' AND is_emi = '0' AND paid_status IS NULL
                            ORDER BY id ASC LIMIT 1) AS first_id
                    FROM installment_details
                        INNER JOIN applied_installment ON applied_installment.id = installment_details.appl_inst_id
                        AND applied_installment.is_completed != 1
                    WHERE stud_id = ? AND installment_details.fee_type = '3' AND installment_details.is_emi = '0'
                `;

                const [instRows] = await db.query(instSql, [studentId, studentId]);

                if (instRows.length > 0) {
                    transportFineApplicable = 0;
                    transRemaining = 0;
                    let sno = 1;

                    for (const rowInsTrans of instRows) {
                        const payableAmount = parseFloat(rowInsTrans.payable_amount) || 0;
                        const paidStatus = rowInsTrans.paid_status;
                        const installmentDate = rowInsTrans.installment_date;
                        const paidDate = rowInsTrans.paid_date;
                        const paidAmount = (parseFloat(rowInsTrans.paid_amount) || 0) + (parseFloat(rowInsTrans.paid_fine) || 0);
                        const instId = rowInsTrans.id;
                        const firstInstId = rowInsTrans.first_id;

                        let lateDays = 0;
                        let fineAmt = 0;
                        let totalPayable = payableAmount;

                        // Unpaid installment
                        if (!paidDate && !paidStatus) {
                            const today = this.getTodayDate();
                            const date1 = new Date(installmentDate);
                            const date2 = new Date(today);
                            const diffDays = Math.floor((date2 - date1) / (1000 * 60 * 60 * 24));

                            if (diffDays > 0 && date1 < date2) {
                                lateDays = diffDays;
                                fineAmt = diffDays * finePerDay;
                                totalPayable = fineAmt + payableAmount;
                                transportFineApplicable += fineAmt;
                                transRemaining += totalPayable;
                            }
                        }
                        // Paid installment
                        else if (paidStatus === '1' && paidDate) {
                            const paidDateFormatted = this.convertToYMDFormat(paidDate);
                            const paidDateOnly = paidDateFormatted.split(' ')[0];
                            const date1 = new Date(installmentDate);
                            const date2 = new Date(paidDateOnly);
                            const diffDays = Math.floor((date2 - date1) / (1000 * 60 * 60 * 24));

                            if (diffDays > 0 && date1 < date2) {
                                lateDays = diffDays;
                                fineAmt = paidAmount - payableAmount;
                                totalPayable = payableAmount + fineAmt;
                            }
                        }

                        // ADD THIS: Push each installment detail to array
                        installmentDetails.push({
                            sno: sno,
                            installment_id: instId,
                            first_installment_id: firstInstId,
                            installment_amount: payableAmount,
                            due_date: installmentDate,
                            paid_amount: paidAmount,
                            paid_date: paidDate || '-',
                            paid_status: paidStatus,
                            late_days: lateDays,
                            fine_amount: fineAmt,
                            total_payable: totalPayable,
                            is_disabled: instId !== firstInstId
                        });

                        sno++;
                    }
                }
                transRemaining = Math.max(0, transRemaining);
            }

            totalFeeWithoutFine += seatFeesApplied;
            totalTransportPaidbase += paidFees1;
            totalRemaining += transRemaining;

            transportData.push({
                bus_type_name: transRow.bus_type_name,
                bus_name: transRow.bus_name,
                bus_number: transRow.bus_number,
                seat_no: transRow.seat_no,
                bus_stopage_name: transRow.bus_stopage_name,
                from_date: transRow.from_date,
                to_date: transRow.to_date,
                due_date: currentTariffDueDate,
                seat_fees_without_fine: seatFeesApplied,
                old_fine: oldFine,
                paid_fees_base: paidFees1,
                remaining_fee_with_fine: transRemaining,
                installment_opt: installmentOpt,
                installment_details: installmentOpt === 1 ? installmentDetails : [],
                outstanding_fine_part: transportFineApplicable
            });
        }

        const totalTransportPaid = totalTransportPaidbase;
        const transportRemainingFees = totalRemaining;
        const totalTransportFees = totalTransportPaid + transportRemainingFees;
        const fineAmountTotal = totalTransportFees - totalFeeWithoutFine;

        response.transport_opted = 1;
        response.transport_data = transportData;
        response.total_transport_paid = totalTransportPaid;
        response.total_transport_fees = totalTransportFees;
        response.total_fee_without_fine = totalFeeWithoutFine;
        response.remaining_fees = transportRemainingFees;
        response.transport_remaining_fees = transportRemainingFees;
        response.fine_amount = fineAmountTotal;

        return response;
    }

    /**
     * Get hostel data with fine calculation
     */
    static async getHostelDataWithFine(studId) {

        const formatDateIST = (date) => {
            if (!date) return null;
            const d = new Date(date);
            // Format as YYYY-MM-DD in IST
            return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
        };

        const sql = `
            SELECT 
                hm.hostel_name,
                hrm.room_no,
                hrtn.room_type_name,
                hbmc.*,
                hal.bed_fees_applied AS current_fee_hostel,
                hal.fine_per_day,
                hal.fine_before_installment,
                hal.due_date AS main_due_date,
                hal.from_date AS main_from_date,
                hal.to_date AS main_to_date,
                hal.fine_paid_total,
                hal.caution_money_applied AS cm_to_pay,
                hal.paid_fees AS current_paid_fees,
                hal.instalement_opt_status,
                hal.id AS allotment_log_id,
                hal.fine_applicable,
                DATE(hal.last_payment_date) AS last_payment_date
            FROM hostel_bed_master_change hbmc
            INNER JOIN hostel_master hm ON hbmc.hostel_id = hm.hostel_id
            INNER JOIN hostel_room_master hrm ON hbmc.room_id = hrm.room_id
            INNER JOIN hostel_room_type_name hrtn ON hbmc.room_type = hrtn.room_name_id
            LEFT JOIN hostel_allotment_log hal ON hbmc.stud_id = hal.stud_id AND hal.allotment_status = '1'
            WHERE hbmc.allotment_status = '1' AND hbmc.stud_id = ?
        `;

        const [rows] = await db.query(sql, [studId]);

        if (!rows || rows.length === 0) {
            return {
                hostel_opted: 0,
                hostel_data: [],
                remaining_fees: 0,
                hostel_remaining_fees: 0,
                total_hostel_fees: 0,
                total_paid_hostel_fees: 0
            };
        }

        const hostelData = [];
        let sumRemainingWithFine = 0;
        let totalBaseFee = 0;
        let totalFineAll = 0;
        let totalPaidPrincipal = 0;
        const finePerDayDefault = 0.25;
        // const finePerDayDefault = 25;

        for (const row of rows) {
            const hostelName = row.hostel_name;
            const roomNo = row.room_no;
            const roomTypeName = row.room_type_name;
            const currentFeeHostel = parseInt(row.current_fee_hostel) || 0;
            const cmToPay = parseInt(row.cm_to_pay) || 0;
            const finePerDay = parseInt(row.fine_per_day) || finePerDayDefault;
            const mainDueDate = formatDateIST(row.main_due_date);
            const mainFromDate = formatDateIST(row.main_from_date);
            const mainToDate = formatDateIST(row.main_to_date);
            const lastPaymentDate = row.last_payment_date;
            const finePaidTotal = parseInt(row.fine_paid_total) || 0;
            const currentPaidFees = parseInt(row.current_paid_fees) || 0;
            const instOptStatus = parseInt(row.instalement_opt_status) || 0;
            const fineApplicable = parseInt(row.fine_applicable) || 0;

            const hostelFeeMain = currentFeeHostel + cmToPay;
            let fineAmountToPaid = 0;
            let fineDaysCount = 0;

            const totalCurrentPayable = currentFeeHostel + cmToPay;
            let remaningCurrent = totalCurrentPayable - currentPaidFees;

            let ramainingHostelAmt = 0;
            const installmentDetails = [];

            // Helper functions
            const checkDateGreaterOrEqual = (lastpaid, due) => {
                if (!lastpaid || !due) return false;
                return new Date(due) < new Date(lastpaid);
            };

            const countDaysFromToday = (date) => {
                if (!date) return 0;
                const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // "2026-07-27"
                const today = new Date(todayIST + 'T00:00:00Z');
                const givenDate = new Date(date);
                givenDate.setUTCHours(0, 0, 0, 0);
                if (givenDate < today) {
                    return Math.floor((today - givenDate) / (1000 * 60 * 60 * 24));
                }
                return 0;
            };

            // Non-installment logic
            if (instOptStatus !== 1) {
                if (checkDateGreaterOrEqual(lastPaymentDate, mainDueDate) && remaningCurrent <= 0 && fineApplicable > 0) {
                    remaningCurrent = 0;
                    let finePayable = fineApplicable - finePaidTotal;
                    if (finePayable < 0) finePayable = 0;
                    fineDaysCount = finePerDay > 0 ? (finePayable / finePerDay) : 0;
                    fineAmountToPaid = finePerDay * fineDaysCount;
                    ramainingHostelAmt = remaningCurrent + fineAmountToPaid;
                } else if (remaningCurrent < 0) {
                    fineDaysCount = 0;
                    remaningCurrent = 0;
                    ramainingHostelAmt = 0;
                } else if (remaningCurrent > 0) {
                    fineDaysCount = countDaysFromToday(mainDueDate);
                    fineAmountToPaid = finePerDay * fineDaysCount;
                    ramainingHostelAmt = remaningCurrent + fineAmountToPaid;
                }
            }
            // Installment logic
            else {
                const appliedInstSql = `
                    SELECT MAX(id) AS appl_inst_id 
                    FROM applied_installment 
                    WHERE std_id = ? AND fee_type = '2'
                `;
                const [appliedInstRows] = await db.query(appliedInstSql, [studId]);
                const applInstId = parseInt(appliedInstRows[0]?.appl_inst_id) || 0;

                if (applInstId > 0) {
                    const instSql = `
                        SELECT
                            id, stud_id, fee_type, is_emi, appl_inst_id,
                            payable_amount, paid_amount, paid_fine, paid_status,
                            paid_date, installment_date,
                            (SELECT id FROM installment_details 
                             WHERE stud_id = ? AND fee_type = '2' AND is_emi = '0' 
                             AND paid_status IS NULL AND appl_inst_id = ?
                             ORDER BY id ASC LIMIT 1) AS first_id,
                            (SELECT paid_date FROM installment_details 
                             WHERE stud_id = ? AND fee_type = '2' AND is_emi = '0' 
                             AND paid_status = '1' AND appl_inst_id = ?
                             ORDER BY id DESC LIMIT 1) AS last_paid_date
                        FROM installment_details
                        WHERE stud_id = ? AND fee_type = '2' AND is_emi = '0' AND appl_inst_id = ?
                        ORDER BY id ASC
                    `;

                    const [instRows] = await db.query(instSql, [studId, applInstId, studId, applInstId, studId, applInstId]);

                    if (instRows.length > 0) {
                        let fineAmtHostelTotal = 0;
                        ramainingHostelAmt = 0;
                        let sno = 1;

                        for (const rowInsHostel of instRows) {
                            const instId = parseInt(rowInsHostel.id);
                            const firstInstId = parseInt(rowInsHostel.first_id) || 0;
                            const installmentDate = rowInsHostel.installment_date;
                            let payableAmount = parseInt(rowInsHostel.payable_amount) || 0;
                            const paidAmountRaw = parseInt(rowInsHostel.paid_amount) || 0;
                            const paidFine = parseInt(rowInsHostel.paid_fine) || 0;
                            const paidStatus = rowInsHostel.paid_status;
                            const paidDate = rowInsHostel.paid_date;
                            const lastPaidDateInstall = rowInsHostel.last_paid_date;

                            const paidAmountTotal = paidAmountRaw + paidFine;
                            let fineAmtHostel = 0;
                            let lateDays = 0;

                            // Unpaid installment
                            if (!paidDate && !paidStatus) {
                                const today = this.getTodayDate();
                                const installmentTs = new Date(installmentDate).getTime();
                                const todayDt = new Date(today);
                                const instDt = new Date(installmentDate);
                                const lastPaidTs = lastPaidDateInstall ? new Date(lastPaidDateInstall).getTime() : 0;

                                let baseDt;
                                if (lastPaidDateInstall && lastPaidTs > installmentTs) {
                                    baseDt = new Date(lastPaidDateInstall);
                                } else {
                                    baseDt = new Date(installmentDate);
                                }

                                const diffDays = Math.floor((todayDt - baseDt) / (1000 * 60 * 60 * 24));

                                if (diffDays > 0) {
                                    lateDays = diffDays;
                                    fineAmtHostel = lateDays * finePerDay;
                                    fineAmtHostelTotal += fineAmtHostel;

                                    if (baseDt >= todayDt) {
                                        lateDays = 0;
                                    }
                                }
                            }
                            // Paid installment
                            else if (paidStatus === '1' && paidDate) {
                                const paidDateFmt = this.convertToYMDFormat(paidDate);
                                const instDt = new Date(installmentDate);
                                const paidDt = new Date(paidDateFmt);

                                const diffDays = Math.floor((paidDt - instDt) / (1000 * 60 * 60 * 24));
                                const finePaid = paidAmountTotal - payableAmount;

                                if (diffDays > 0) {
                                    lateDays = diffDays;
                                    fineAmtHostel = finePaid;
                                }

                                payableAmount = 0;
                            }

                            fineAmountToPaid = fineAmtHostel;
                            fineDaysCount = Math.abs(lateDays);
                            ramainingHostelAmt += payableAmount;

                            installmentDetails.push({
                                id: instId,
                                sno: sno++,
                                payable_amount: rowInsHostel.payable_amount,
                                current_payable: payableAmount,
                                paid_amount: paidAmountRaw,
                                paid_fine: paidFine,
                                paid_total: paidAmountTotal,
                                paid_status: paidStatus,
                                paid_date: paidDate,
                                installment_date: installmentDate,
                                late_days: lateDays,
                                fine_amount: fineAmtHostel
                            });
                        }

                        ramainingHostelAmt += fineAmtHostelTotal;
                    }
                }
            }

            const remainingWithFine = Math.max(0, ramainingHostelAmt);
            const remainingWithoutFine = Math.max(0, hostelFeeMain - currentPaidFees);
            let outstandingFine = remainingWithFine - remainingWithoutFine;
            if (outstandingFine < 0) outstandingFine = 0;

            const fineAmountRow = finePaidTotal + outstandingFine;

            sumRemainingWithFine += remainingWithFine;
            totalBaseFee += hostelFeeMain;
            totalFineAll += fineAmountRow;
            totalPaidPrincipal += currentPaidFees;

            hostelData.push({
                hostel_name: hostelName,
                room_no: roomNo,
                from_date: mainFromDate,
                to_date: mainToDate,
                room_type_name: roomTypeName,
                hostel_fee_main: hostelFeeMain,
                current_fee_hostel: currentFeeHostel,
                cm_to_pay: cmToPay,
                fine_per_day: finePerDay,
                fine_paid_total: finePaidTotal,
                fine_amount: fineAmountRow,
                remaining_fees_with_fine: remainingWithFine,
                remaining_fees_without_fine: remainingWithoutFine,
                fine_days_current: fineDaysCount,
                installments: installmentDetails,
                main_due_date: mainDueDate,
            });
        }

        const hostelRemainingFees = sumRemainingWithFine;
        const totalHostelFees = totalBaseFee + totalFineAll;

        return {
            hostel_data: hostelData,
            remaining_fees: hostelRemainingFees,
            hostel_remaining_fees: hostelRemainingFees,
            total_hostel_fees: totalHostelFees,
            total_paid_hostel_fees: totalPaidPrincipal,
            hostel_opted: 1
        };
    }

    /**
     * Calculate library fine
     */
    static async calculateLibFine(studId) {
        // Regular library books
        const rgSql = `
            SELECT * FROM book_issue_master
            WHERE book_issue_master.student_id = ?
            AND (
                Date(book_issue_master.return_date) > Date(book_issue_master.to_date) 
                OR (CURRENT_DATE > to_date AND (return_date = '' OR return_date IS NULL))
            )
            AND fine_paid_status = '0'
        `;

        // Book bank
        const bbSql = `
            SELECT * FROM book_bank_issue
            WHERE book_bank_issue.student_id = ?
            AND (
                Date(book_bank_issue.return_date2) > Date(book_bank_issue.return_date) 
                OR (CURRENT_DATE > return_date AND (return_date2 = '' OR return_date2 IS NULL))
            )
            AND fine_paid_status = '0'
        `;

        const [rgRows] = await db.query(rgSql, [studId]);
        const [bbRows] = await db.query(bbSql, [studId]);

        let totalFineLib = 0;
        let payableFineLib = 0;

        // Process regular library books
        for (const row of rgRows) {
            const toDate = row.to_date;
            const returnDate = row.return_date;

            if (returnDate) {
                const days = this.getDaysDifference(toDate, returnDate);
                const fine = days * 5;
                payableFineLib += fine;
                totalFineLib += fine;
            } else {
                const today = this.getTodayDate();
                const days = this.getDaysDifference(toDate, today);
                const fine = days * 5;
                totalFineLib += fine;
            }
        }

        // Process book bank
        for (const row of bbRows) {
            const toDate = row.return_date;
            const returnDate = row.return_date2;

            if (returnDate) {
                const days = this.getDaysDifference(toDate, returnDate);
                const fine = days * 5;
                payableFineLib += fine;
                totalFineLib += fine;
            } else {
                const today = this.getTodayDate();
                const days = this.getDaysDifference(toDate, today);
                const fine = days * 5;
                totalFineLib += fine;
            }
        }

        // Get paid amount
        const paidSql = `
            SELECT SUM(total_paid_fees) as lib_paid 
            FROM library_fine_payment_details 
            WHERE stud_id = ? AND payment_status = '1'
        `;
        const [paidRows] = await db.query(paidSql, [studId]);
        const paidAmountLib = parseInt(paidRows[0]?.lib_paid) || 0;

        return {
            total_lib_fine: totalFineLib,
            lib_paid_amount: paidAmountLib,
            payable_fine_lib: payableFineLib
        };
    }

    // ==================== MAIN FUNCTION ====================

    /**
     * Get all fees data for a student (main function)
     * Returns the same structure as the PHP get_data_by_stud_all_fees function
     */
    static async getAllFeesData(studId) {
        try {
            studId = String(studId).trim();

            // Get student data
            const studentData = await this.getStudentCurrentSemester(studId);

            if (!studentData) {
                return { success: false, message: 'Student not found' };
            }

            const {
                stud_name, stud_mobile, stud_roll_no, university_roll_no,
                stud_email_id, stud_fathername, stud_father_mobno,
                sem_year_id, admission_year, admis_on_sem_year_id,
                clg_id, cor_id, branch_id, admission_incharge, atten_nonatten_priv, branch_name, cor_name, clg_name
            } = studentData;

            const studData = {
                stud_id: studId,
                stud_name,
                stud_mobile,
                stud_roll_no,
                university_roll_no,
                stud_email_id,
                stud_fathername,
                stud_father_mobno,
                sem_year_id,
                admission_year,
                admis_on_sem_year_id,
                clg_id,
                cor_id,
                branch_id,
                admission_incharge,
                atten_nonatten_priv,
                branch_name, cor_name, clg_name
            };

            // Get applicable fees
            const feesSql = `
                SELECT student_applicable_fee.* 
                FROM student_applicable_fee, stud_current_sem_year 
                WHERE student_applicable_fee.stud_id = ? 
                AND student_applicable_fee.sem_id = stud_current_sem_year.sem_year_id 
                AND student_applicable_fee.stud_id = stud_current_sem_year.stud_id 
                AND fee_category NOT IN (20, 17, 18, 11)
            `;

            const [feeRows] = await db.query(feesSql, [studId]);

            let academicFee = 0;
            let academicPaid = 0;
            let academicApplicableFine = 0;
            let academicFinePaid = 0;
            let academicDueDate = '0000-00-00';
            let installmentFee = 0;

            let scholarshipFee = 0;
            let scholarshipPaid = 0;
            let scholarshipApplicableFine = 0;
            let totalFinePaidSch = 0;
            let scholarshipDueDate = null;

            const feesApplicable = [];
            const fineApplicableArr = [];
            const finePaidArr = [];
            let totalArr = [];
            let installment = [];

            for (const row of feeRows) {
                const feeType = row.fee_type;
                const feeAmount = parseInt(row.fee_amount) || 0;
                const feePaid = parseInt(row.fee_paid) || 0;
                const fineApplicable = parseInt(row.applicable_fine) || 0;
                const finePaid = parseInt(row['fine paid']) || 0;
                const dueDate = row.due_date;
                const feeCategory = row.fee_category;

                if (feeType === 'scholarship_fee') {
                    // Process scholarship data
                    const scholarshipData = await this.getScholarshipData(studId, sem_year_id);

                    for (const data of scholarshipData) {
                        const receivableScholarship = parseFloat(data.reciveable_scholarship) || 0;
                        const scDueDate = data.sc_due_date;
                        const paymentDoneOn = data.payment_done_on;
                        const paymentDone = data.payment_done;
                        const finePaidData = parseFloat(data.fine_paid) || 0;
                        const paidAmt = parseFloat(data.paid_amt) || 0;
                        const applicableFineData = parseFloat(data.applicable_fine) || 0;

                        scholarshipApplicableFine += applicableFineData;
                        scholarshipFee += receivableScholarship;

                        if (paymentDone === 1 || paymentDone === '1') {
                            scholarshipPaid += paidAmt;
                        }

                        totalFinePaidSch += finePaidData;
                        scholarshipDueDate = this.convertToYMDFormat(scDueDate);
                    }

                    feesApplicable.push({
                        fee_type: 'scholarship_fee',
                        fee_amount: scholarshipFee,
                        fee_paid: scholarshipPaid,
                        due_date: scholarshipDueDate
                    });

                    if (totalFinePaidSch > 0) {
                        finePaidArr.push({
                            paid_amt: totalFinePaidSch,
                            fine_paid_for: 'scholarship_fee'
                        });
                    }
                } else if (feeType === 'installment_fee' || feeCategory === 19 || feeCategory === '19') {
                    installmentFee = feeAmount;
                } else {
                    academicFee += feeAmount;
                    academicPaid += feePaid;
                    academicApplicableFine += fineApplicable;
                    academicFinePaid += finePaid;

                    feesApplicable.push({
                        fee_type: feeType,
                        fee_amount: feeAmount,
                        fee_paid: feePaid,
                        due_date: dueDate
                    });

                    if (feeType === 'tution_fee') {
                        academicDueDate = dueDate;
                        if (academicFinePaid > 0) {
                            finePaidArr.push({
                                paid_amt: academicFinePaid,
                                fine_paid_for: 'tution_fee'
                            });
                        }
                    }
                }
            }

            const scholarshipRemaining = scholarshipFee - scholarshipPaid;
            const academicRemaining = academicFee - academicPaid;
            let academicInstallmentDetails = null;

            const lastPaidDate = await this.getLastPaidDate(studId, sem_year_id);

            if (installmentFee > 0) {
                academicInstallmentDetails = await this.getAcademicInstallmentDetails(
                    studId, clg_id, cor_id, branch_id, sem_year_id
                );
            }

            // Calculate fine based on payment status
            if (installmentFee === 0) {
                // Non-installment mode
                if (academicRemaining > 0 && scholarshipRemaining <= 0) {
                    if (academicDueDate && academicDueDate !== '0000-00-00 00:00:00' && academicDueDate !== '0000-00-00') {
                        const todayDate = this.getTodayDate();
                        const greaterDate = this.getGreaterDate(academicDueDate, todayDate);

                        if (greaterDate === todayDate) {
                            let fineData;
                            if (clg_id !== '8' && clg_id !== 8) {
                                fineData = this.calculateFine(0.25, academicDueDate, greaterDate, 'tution_fee');
                            } else {
                                fineData = this.calculateFine(10, academicDueDate, greaterDate, 'tution_fee');
                            }

                            academicApplicableFine = fineData.total_fine;
                            academicFee += academicApplicableFine;

                            fineApplicableArr.push({
                                fine_amt: academicApplicableFine,
                                fine_applied_on: 'tution_fee',
                                fine_type: fineData.type,
                                fine_duration: fineData.duration,
                                fine_multiplier: fineData.fine_amt
                            });
                        } else {
                            academicApplicableFine = 0;
                        }
                    } else {
                        academicApplicableFine = 0;
                    }
                } else if (academicRemaining <= 0 && scholarshipRemaining <= 0) {
                    // Both paid - check for late payment fine
                    const newAcademicFineDueDate = await this.getAcademicPaidDate(studId, clg_id, cor_id, branch_id, sem_year_id);
                    const lastAcademicPaidDate = newAcademicFineDueDate.last_academic_paid_date;
                    const academicDueDateNew = newAcademicFineDueDate.academic_due_date;

                    const greaterDate = this.getGreaterDate(lastAcademicPaidDate, academicDueDateNew);

                    if (greaterDate === lastAcademicPaidDate && greaterDate !== academicDueDateNew) {
                        let fineData;
                        if (clg_id === '8' || clg_id === 8) {
                            fineData = this.calculateFine(10, academicDueDateNew, lastAcademicPaidDate, 'tution_fee');
                        } else {
                            fineData = this.calculateFine(0.25, academicDueDateNew, lastAcademicPaidDate, 'tution_fee');
                        }
                        academicApplicableFine = fineData.total_fine;
                    } else {
                        academicApplicableFine = 0;
                    }

                    academicFee += parseFloat(academicApplicableFine);
                    scholarshipFee += parseFloat(scholarshipApplicableFine);

                    fineApplicableArr.push({ fine_amt: academicApplicableFine, fine_applied_on: 'tution_fee' });
                    fineApplicableArr.push({ fine_amt: scholarshipApplicableFine, fine_applied_on: 'scholarship_fee' });
                } else if (scholarshipRemaining > 0 && academicRemaining <= 0) {
                    // Scholarship remaining
                    if (scholarshipDueDate && scholarshipDueDate !== '0000-00-00 00:00:00' && scholarshipDueDate !== '0000-00-00') {
                        const todayDate = this.getTodayDate();
                        const greaterDate = this.getGreaterDate(scholarshipDueDate, todayDate);

                        if (greaterDate === todayDate) {
                            const fineData = this.calculateFine(0.25, scholarshipDueDate, greaterDate, 'scholarship_fee');
                            scholarshipApplicableFine = fineData.total_fine;
                            scholarshipFee += scholarshipApplicableFine;

                            fineApplicableArr.push({
                                fine_amt: scholarshipApplicableFine,
                                fine_applied_on: 'scholarship_fee',
                                fine_type: fineData.type,
                                fine_duration: fineData.duration,
                                fine_multiplier: fineData.fine_amt
                            });
                        } else {
                            scholarshipApplicableFine = 0;
                        }
                    }
                } else if (academicRemaining > 0 && scholarshipRemaining > 0) {
                    // Both remaining
                    const finalDueDate = this.getLesserDate(academicDueDate, scholarshipDueDate);

                    if (finalDueDate && academicDueDate !== '0000-00-00 00:00:00' && scholarshipDueDate !== '0000-00-00 00:00:00') {
                        const today = this.getTodayDate();
                        const greaterDate = this.getGreaterDate(finalDueDate, today);

                        if (today === greaterDate) {
                            if (finalDueDate === academicDueDate) {
                                let fineData;
                                if (clg_id !== '8' && clg_id !== 8) {
                                    fineData = this.calculateFine(0.25, finalDueDate, greaterDate, 'tution_fee');
                                } else {
                                    fineData = this.calculateFine(10, finalDueDate, greaterDate, 'tution_fee');
                                }
                                academicApplicableFine = fineData.total_fine;
                                academicFee += academicApplicableFine;

                                fineApplicableArr.push({
                                    fine_amt: academicApplicableFine,
                                    fine_applied_on: 'tution_fee',
                                    fine_type: fineData.type,
                                    fine_duration: fineData.duration,
                                    fine_multiplier: fineData.fine_amt
                                });
                            } else if (finalDueDate === scholarshipDueDate) {
                                const fineData = this.calculateFine(0.25, finalDueDate, greaterDate, 'scholarship_fee');
                                scholarshipApplicableFine = fineData.total_fine;
                                scholarshipFee += scholarshipApplicableFine;

                                fineApplicableArr.push({
                                    fine_amt: scholarshipApplicableFine,
                                    fine_applied_on: 'scholarship_fee',
                                    fine_type: fineData.type,
                                    fine_duration: fineData.duration,
                                    fine_multiplier: fineData.fine_amt
                                });
                            }
                        }
                    } else {
                        academicApplicableFine = 0;
                        scholarshipApplicableFine = 0;
                    }
                }

                // Calculate totals for non-installment mode
                const totalApplicableFee = academicFee + scholarshipFee;
                const totalPaid = academicPaid + academicFinePaid + scholarshipPaid + totalFinePaidSch;
                const totalRemaining = Math.max(0, totalApplicableFee - totalPaid);

                totalArr.push({
                    total_applicable_fee: totalApplicableFee,
                    total_paid: totalPaid,
                    total_remaining: totalRemaining
                });
            } else {
                // Installment mode
                const installData = await this.getInstallmentData(studId);

                let totalAmt = 0;
                let totalPaid = 0;
                let totalFine = 0;
                let totalFinePaidInst = 0;
                let principalAmt = 0;
                let fineBeforeInstallment = 0;

                for (const data of installData) {
                    const baseAmt = data.total_amount;
                    const installmentDate = this.convertToYMDFormat(data.installment_date);
                    const paidDate = this.convertToYMDFormat(data.paid_date);
                    const paidStatus = data.paid_status;
                    const paidAmount = parseFloat(data.paid_amount) || 0;
                    const payableAmount = parseFloat(data.payable_amount) || 0;
                    const paidFine = parseFloat(data.paid_fine) || 0;

                    totalAmt += payableAmount;
                    principalAmt = parseFloat(baseAmt);
                    fineBeforeInstallment = parseFloat(data.fine_before_installment) || 0;

                    if (paidStatus === '1' || paidStatus === 1) {
                        totalPaid += paidAmount + paidFine;
                        totalFinePaidInst += paidFine;
                        totalFine += paidFine;
                    } else {
                        const todayDate = this.convertToYMDFormat(this.getTodayDate());
                        const greaterDate = this.getGreaterDate(installmentDate, todayDate);

                        if (greaterDate === todayDate) {
                            const fineAmt = this.calculateFineInstallment(installmentDate, todayDate);
                            totalFine += fineAmt || 0;
                        }
                    }
                }

                totalAmt = totalAmt + totalFine;
                const totalRemaining = Math.max(0, totalAmt - totalPaid);

                const installDataResult = {
                    total_amt: totalAmt,
                    total_paid: totalPaid,
                    total_fine: totalFine,
                    total_fine_paid: totalFinePaidInst,
                    total_remaining: totalRemaining,
                    principal_amt: principalAmt,
                    fine_before_installment: fineBeforeInstallment
                };

                installment.push(installDataResult);

                // Update fees applicable for installment mode
                const installmntAmt = totalAmt - totalFine;

                if (totalPaid > totalAmt) {
                    feesApplicable.push({
                        fee_type: 'fine_before_installment',
                        fee_amount: fineBeforeInstallment,
                        fee_paid: fineBeforeInstallment
                    });
                } else {
                    feesApplicable.push({
                        fee_type: 'fine_before_installment',
                        fee_amount: fineBeforeInstallment,
                        fee_paid: 0
                    });
                }

                fineApplicableArr.push({
                    fine_amt: totalFine,
                    fine_applied_on: 'installment_fee'
                });

                feesApplicable.push({
                    fee_type: 'installment_fee',
                    fee_amount: installmntAmt,
                    fee_paid: totalPaid
                });

                finePaidArr.push({
                    paid_amt: totalFinePaidInst,
                    fine_paid_for: 'installment_fee'
                });

                totalArr.push({
                    total_applicable_fee: totalAmt,
                    total_paid: totalPaid,
                    total_remaining: totalRemaining
                });
            }

            // Get additional data
            const additionalFeeArr = await this.getAdditionalFee(studId, clg_id, cor_id, branch_id, sem_year_id);
            const hostelArr = await this.getHostelDataWithFine(studId);
            const transportArr = await this.getTransportWithFine(studId);
            const libDetails = await this.calculateLibFine(studId);
            const gymDetails = await this.getGymDetails(studId);

            // Build final response
            const jsonData = {
                success: true,
                stud_data: studData,
                fees_applicable_arr: feesApplicable,
                fine_applicable_arr: fineApplicableArr,
                fine_paid_arr: finePaidArr,
                total_arr: totalArr,
                additional_fee_arr: additionalFeeArr,
                hostel_arr: hostelArr,
                transport_arr: transportArr,
                lib_details: libDetails,
                gym_details: gymDetails,
                installment: installment.length > 0 ? installment : null,
                academic_installment_details: academicInstallmentDetails
            };

            return jsonData;

        } catch (error) {
            console.error('Error in getAllFeesData:', error);
            return {
                success: false,
                message: 'Error fetching fee data',
                error: error.message
            };
        }
    }

    static async isAllowedInstallment(studId) {
        try {
            const query = `
            SELECT 
                all_active_semester_year.class_end_date,
                student_reciveable_fee.scholarship AS scholarship_amt1,
                student_reciveable_fee.scholarship_fee AS scholarship_amt2,
                stud_current_sem_year.clg_id
            FROM stud_current_sem_year
            JOIN all_active_semester_year 
                ON stud_current_sem_year.clg_id = all_active_semester_year.clg_id
                AND stud_current_sem_year.cor_id = all_active_semester_year.cor_id
                AND stud_current_sem_year.branch_id = all_active_semester_year.branch_id
                AND stud_current_sem_year.sem_year_id = all_active_semester_year.sem_id
            JOIN student_reciveable_fee 
                ON stud_current_sem_year.stud_id = student_reciveable_fee.student_id
            WHERE stud_current_sem_year.stud_id = ?
        `;

            const [rows] = await db.query(query, [studId]);

            if (!rows || rows.length === 0) {
                return {
                    success: true,
                    allowed: false,
                    message: 'No student data found'
                };
            }

            const row = rows[0];
            const classEndDate = new Date(row.class_end_date);
            const todayDate = new Date();
            todayDate.setHours(0, 0, 0, 0);
            classEndDate.setHours(0, 0, 0, 0);

            const scholarshipAmt1 = parseInt(row.scholarship_amt1) || 0;
            const scholarshipAmt2 = parseInt(row.scholarship_amt2) || 0;

            // Determine final scholarship amount (last non-zero value wins)
            let finalScAmt = 0;
            if (scholarshipAmt1 > 0) {
                finalScAmt = scholarshipAmt1;
            }
            if (scholarshipAmt2 > 0) {
                finalScAmt = scholarshipAmt2;
            }

            // Calculate days difference
            const diffTime = classEndDate - todayDate;
            const daysGone = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Get college name (you may need to adjust this based on your schema)
            const collegeName = await this.getCollegeName(row.clg_id);

            // Installment is allowed if:
            // 1. Class has not ended (daysGone >= 0)
            // 2. College is not 'RCDSR'
            // 3. No scholarship amount
            const isAllowed = daysGone >= 0
                && collegeName !== 'RCDSR'
                && (finalScAmt === 0 || finalScAmt === null);

            return {
                success: true,
                allowed: isAllowed,
                data: {
                    classEndDate: row.class_end_date,
                    daysRemaining: daysGone,
                    scholarshipAmount: finalScAmt,
                    collegeName: collegeName
                }
            };

        } catch (error) {
            console.error('Error in isAllowedInstallment:', error);
            return {
                success: false,
                allowed: false,
                message: 'Error fetching isAllowedInstallment',
                error: error.message
            };
        }
    }

    /**
     * Get fee summary (simplified version for quick access)
     */
    static async getFeeSummary(studId) {
        try {
            const fullData = await this.getAllFeesData(studId);

            if (!fullData.success) {
                return fullData;
            }

            const totalData = fullData.total_arr[0] || {};
            const hostelData = fullData.hostel_arr || {};
            const transportData = fullData.transport_arr || {};
            const libData = fullData.lib_details || {};
            const studData = fullData.stud_data || {};

            // Get semester ID from student data
            const semId = studData.sem_year_id;

            // Fetch scholarship data
            let scholarshipData = [];
            let scholarshipSummary = {
                total_scholarship: 0,
                total_received: 0,
                total_pending: 0,
                total_fine: 0,
                total_fine_paid: 0,
                due_date: null,
                records: []
            };

            if (semId) {
                scholarshipData = await this.getScholarshipData(studId, semId);

                if (scholarshipData && scholarshipData.length > 0) {
                    let totalScholarship = 0;
                    let totalReceived = 0;
                    let totalFine = 0;
                    let totalFinePaid = 0;
                    let earliestDueDate = null;

                    scholarshipData.forEach(record => {
                        const receivable = parseFloat(record.reciveable_scholarship) || 0;
                        const paidAmt = parseFloat(record.paid_amt) || 0;
                        const applicableFine = parseFloat(record.applicable_fine) || 0;
                        const finePaid = parseFloat(record.fine_paid) || 0;
                        const paymentDone = record.payment_done;
                        const scDueDate = record.sc_due_date;

                        totalScholarship += receivable;
                        totalFine += applicableFine;
                        totalFinePaid += finePaid;

                        if (paymentDone === 1 || paymentDone === '1') {
                            totalReceived += paidAmt;
                        }

                        // Track earliest due date
                        if (scDueDate && scDueDate !== '0000-00-00') {
                            if (!earliestDueDate || new Date(scDueDate) < new Date(earliestDueDate)) {
                                earliestDueDate = scDueDate;
                            }
                        }
                    });

                    scholarshipSummary = {
                        total_scholarship: totalScholarship,
                        total_received: totalReceived,
                        total_pending: totalScholarship - totalReceived,
                        total_fine: totalFine,
                        total_fine_paid: totalFinePaid,
                        payable_fine: totalFine - totalFinePaid,
                        due_date: earliestDueDate,
                        records: scholarshipData.map(record => ({
                            id: record.sc_id,
                            scholarship_name: record.scholarship_name || 'Scholarship',
                            receivable_amount: parseFloat(record.reciveable_scholarship) || 0,
                            paid_amount: parseFloat(record.paid_amt) || 0,
                            applicable_fine: parseFloat(record.applicable_fine) || 0,
                            fine_paid: parseFloat(record.fine_paid) || 0,
                            payment_done: record.payment_done === 1 || record.payment_done === '1',
                            payment_done_on: record.payment_done_on,
                            due_date: record.sc_due_date,
                            status: (record.payment_done === 1 || record.payment_done === '1') ? 'Paid' : 'Pending'
                        }))
                    };
                }
            }

            return {
                success: true,
                stud_id: studId,
                stud_name: studData.stud_name,
                stud_roll_no: studData.stud_roll_no,
                semester: semId,
                academic: {
                    total_fee: totalData.total_applicable_fee || 0,
                    total_paid: totalData.total_paid || 0,
                    remaining: totalData.total_remaining || 0
                },
                scholarship: scholarshipSummary,
                hostel: {
                    opted: hostelData.hostel_opted || 0,
                    total_fee: hostelData.total_hostel_fees || 0,
                    total_paid: hostelData.total_paid_hostel_fees || 0,
                    remaining: hostelData.hostel_remaining_fees || 0
                },
                transport: {
                    opted: transportData.transport_opted || 0,
                    total_fee: transportData.total_transport_fees || 0,
                    total_paid: transportData.total_transport_paid || 0,
                    remaining: transportData.transport_remaining_fees || 0
                },
                library: {
                    total_fine: libData.total_lib_fine || 0,
                    paid: libData.lib_paid_amount || 0,
                    payable: libData.payable_fine_lib || 0
                },
                grand_total: {
                    total_fee: (totalData.total_applicable_fee || 0) +
                        (hostelData.total_hostel_fees || 0) +
                        (transportData.total_transport_fees || 0) +
                        (libData.total_lib_fine || 0) +
                        (scholarshipSummary.total_pending || 0), // Include pending scholarship
                    total_paid: (totalData.total_paid || 0) +
                        (hostelData.total_paid_hostel_fees || 0) +
                        (transportData.total_transport_paid || 0) +
                        (libData.lib_paid_amount || 0) +
                        (scholarshipSummary.total_received || 0), // Include received scholarship
                    remaining: (totalData.total_remaining || 0) +
                        (hostelData.hostel_remaining_fees || 0) +
                        (transportData.transport_remaining_fees || 0) +
                        (libData.payable_fine_lib || 0) +
                        (scholarshipSummary.total_pending || 0) // Include pending scholarship
                }
            };

        } catch (error) {
            console.error('Error in getFeeSummary:', error);
            return {
                success: false,
                message: 'Error fetching fee summary',
                error: error.message
            };
        }
    }

    static async getAcademicInstallmentDetails(studId, clgId, corId, branchId, semId) {
        try {
            const sql = `
            SELECT 
                ai.id AS applied_inst_id,
                ai.fee_type,
                ai.is_emi,
                ai.std_id,
                ai.clg_id,
                ai.cor_id,
                ai.bra_id,
                ai.sem_id,
                ai.no_of_installments,
                ai.installment_applied_on,
                ai.total_amount,
                ai.total_amt_with_interest,
                ai.each_month_emi_date,
                ai.fine_before_installment,
                ai.is_completed,
                id.id AS inst_detail_id,
                id.appl_inst_id,
                id.installment_no,
                id.installment_date,
                id.payable_amount,
                id.paid_amount,
                id.paid_date,
                id.paid_status,
                id.paid_fine,
                id.oid,
                id.trans_status
            FROM applied_installment ai
            INNER JOIN installment_details id ON id.appl_inst_id = ai.id
            WHERE ai.std_id = ?
                AND ai.clg_id = ?
                AND ai.cor_id = ?
                AND ai.bra_id = ?
                AND ai.sem_id = ?
                AND ai.fee_type = '1'
                AND (ai.is_emi = '1' OR ai.is_emi = '0')
            ORDER BY id.installment_no ASC
        `;

            const [rows] = await db.query(sql, [studId, clgId, corId, branchId, semId]);

            if (!rows || rows.length === 0) {
                return null;
            }

            // Get the first row for summary data
            const firstRow = rows[0];

            // Process installments with fine calculation
            const installments = rows.map(row => {
                const isPaid = row.paid_status === '1' || row.paid_status === 1;
                let fineAmount = 0;
                let lateDays = 0;

                if (!isPaid && row.installment_date) {
                    const installmentDate = new Date(row.installment_date);
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);
                    installmentDate.setHours(0, 0, 0, 0);

                    if (today > installmentDate) {
                        lateDays = Math.floor((today - installmentDate) / (1000 * 60 * 60 * 24));

                        // Fine calculation: Rs 10/day for first 10 days, Rs 25/day from day 11 onwards
                        if (lateDays <= 10) {
                            fineAmount = lateDays * 10;
                        } else {
                            fineAmount = (100) + ((lateDays - 10) * 25);
                        }
                    }
                }

                return {
                    id: row.inst_detail_id,
                    sno: row.installment_no,
                    installment_no: row.installment_no,
                    installment_date: row.installment_date,
                    payable_amount: parseFloat(row.payable_amount) || 0,
                    current_payable: parseFloat(row.payable_amount) || 0,
                    paid_amount: parseFloat(row.paid_amount) || 0,
                    paid_date: row.paid_date,
                    paid_status: isPaid ? 'paid' : 'unpaid',
                    paid_fine: parseFloat(row.paid_fine) || 0,
                    late_days: lateDays,
                    fine_amount: fineAmount,
                    oid: row.oid,
                    trans_status: row.trans_status
                };
            });

            // Calculate totals
            let totalPayable = 0;
            let totalPaid = 0;
            let totalFine = 0;
            let totalFinePaid = 0;

            installments.forEach(inst => {
                totalPayable += inst.payable_amount;
                totalPaid += inst.paid_amount + inst.paid_fine;
                totalFine += inst.fine_amount;
                totalFinePaid += inst.paid_fine;
            });

            return {
                applied_inst_id: firstRow.applied_inst_id,
                is_emi: firstRow.is_emi,
                no_of_installments: parseInt(firstRow.no_of_installments) || 0,
                installment_applied_on: firstRow.installment_applied_on,
                total_amount: parseFloat(firstRow.total_amount) || 0,
                total_amt_with_interest: parseFloat(firstRow.total_amt_with_interest) || 0,
                each_month_emi_date: firstRow.each_month_emi_date,
                fine_before_installment: parseFloat(firstRow.fine_before_installment) || 0,
                is_completed: firstRow.is_completed === '1' || firstRow.is_completed === 1,
                installments: installments,
                summary: {
                    total_payable: totalPayable,
                    total_paid: totalPaid,
                    total_fine: totalFine,
                    total_fine_paid: totalFinePaid,
                    total_remaining: Math.max(0, totalPayable + totalFine - totalPaid)
                }
            };

        } catch (error) {
            console.error('❌ Error fetching academic installment details:', error);
            return null;
        }
    }

    static async getScholarshipData(studId, semId) {
        try {
            const sql = `
            SELECT 
                *,
                due_date AS sc_due_date,
                id AS sc_id
            FROM applied_scholarship_log 
            WHERE stud_id = ? 
            AND sem_id = ?
        `;

            const [rows] = await db.query(sql, [studId, semId]);

            // console.log('📚 Scholarship Data for student', studId, ':', rows);

            return rows || [];
        } catch (error) {
            console.error('❌ Error fetching scholarship data:', error);
            return [];
        }
    }

    static async gymSubscriptionData(studId) {
        try {

            const gym_details = this.getGymDetails(studId);
            // const gym_details = false;

            if (gym_details) {
                return gym_details;
            } else {
                const [hostelResult] = await db.query(
                    `SELECT * FROM hostel_allotment_log WHERE stud_id = ? AND allotment_status = '1'`,
                    [studId]
                );

                if (!hostelResult || hostelResult.length === 0) {
                    return [];
                }

                const toDate = new Date(hostelResult[0].to_date);
                const now = new Date();

                // Calculate difference in months
                const totalMonths = (toDate.getFullYear() - now.getFullYear()) * 12
                    + (toDate.getMonth() - now.getMonth());

                let subscriptionTypes = [];

                if (totalMonths >= 1 && totalMonths <= 3) {
                    subscriptionTypes = ['Quarterly'];
                } else if (totalMonths >= 4 && totalMonths <= 6) {
                    subscriptionTypes = ['Quarterly', 'Half-Yearly'];
                } else if (totalMonths >= 7 && totalMonths <= 12) {
                    subscriptionTypes = ['Quarterly', 'Half-Yearly', 'Yearly'];
                } else {
                    return [];
                }

                const sql = `
                    SELECT id, subscription_type, subscription_amount 
                    FROM gym_master 
                    WHERE subscription_type IN (?) AND is_active = '1'
                `;

                const [rows] = await db.query(sql, [subscriptionTypes]);

                return rows || [];
            }

        } catch (error) {
            console.error('❌ Error fetching gym subscription data:', error);
            return [];
        }
    }

    static async getGymDetails(studId) {
        try {
            const [gymResult] = await db.query(
                `SELECT * FROM gym_subscription_fee_transaction_details WHERE stud_id= ? AND is_active='1' AND soft_delete='0' LIMIT 1;`,
                [studId]
            );

            if (!gymResult || gymResult.length === 0) {
                return [];
            } else {
                return gymResult;
            }

        } catch (error) {
            console.error('❌ Error fetching gym subscription data:', error);
            return [];
        }
    }
}

module.exports = FeesModel;