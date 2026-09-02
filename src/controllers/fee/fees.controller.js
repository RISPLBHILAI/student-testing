const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const FeesModel = require('../../models/feesModel');
const otpSvc = require('../../../../shared/services/otpService');
const notifSvc = require('../../../../shared/services/notificationService');
const IS_DEV = process.env.NODE_ENV !== 'production';

async function getAllFees(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Fetching all fees for student: ${studId}`);

        const feesData = await FeesModel.getAllFeesData(studId);

        if (!feesData.success) return sendError(res, feesData.message || 'Fees not found', 404);

        return sendSuccess(res, feesData, 'Fees fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getAllFees error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function isAllowedInstallment(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Checking installment eligibility for student: ${studId}`);

        const isAllowedData = await FeesModel.isAllowedInstallment(studId);

        if (!isAllowedData.success) return sendError(res, isAllowedData.message || 'Error checking installment', 500);

        return sendSuccess(res, isAllowedData.data, 'Installment eligibility fetched successfully');

    } catch (err) {
        logger.error(`[Fees] isAllowedInstallment error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function getFeeSummary(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Fetching fee summary for student: ${studId}`);

        const summaryData = await FeesModel.getFeeSummary(studId);

        if (!summaryData.success) return sendError(res, summaryData.message || 'Summary not found', 404);

        return sendSuccess(res, summaryData.data, 'Fee summary fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getFeeSummary error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function getHostelFees(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Fetching hostel fees for student: ${studId}`);

        const hostelData = await FeesModel.getHostelDataWithFine(studId);

        return sendSuccess(res, hostelData, 'Hostel fees fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getHostelFees error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function getTransportFees(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Fetching transport fees for student: ${studId}`);

        const transportData = await FeesModel.getTransportWithFine(studId);

        return sendSuccess(res, transportData, 'Transport fees fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getTransportFees error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function getLibraryFine(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Fetching library fine for student: ${studId}`);

        const libData = await FeesModel.calculateLibFine(studId);

        return sendSuccess(res, libData, 'Library fine fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getLibraryFine error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function getAdditionalFees(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Fetching additional fees for student: ${studId}`);

        const studentData = await FeesModel.getStudentCurrentSemester(studId);

        if (!studentData) return sendError(res, 'Student not found', 404);

        const { clg_id, cor_id, branch_id, sem_year_id } = studentData;

        const additionalData = await FeesModel.getAdditionalFee(
            studId, clg_id, cor_id, branch_id, sem_year_id
        );

        return sendSuccess(res, additionalData, 'Additional fees fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getAdditionalFees error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function getInstallmentData(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Fetching installment data for student: ${studId}`);

        const installmentData = await FeesModel.getInstallmentData(studId);

        return sendSuccess(res, installmentData, 'Installment data fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getInstallmentData error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function getScholarshipData(req, res) {
    try {
        const studId = req.user.user_id;
        const { semId } = req.params;

        if (!studId || !semId) return sendError(res, 'Student ID and Semester ID are required', 400);

        logger.info(`[Fees] Fetching scholarship data for student: ${studId}, sem: ${semId}`);

        const scholarshipData = await FeesModel.getScholarshipData(studId, semId);

        return sendSuccess(res, scholarshipData, 'Scholarship data fetched successfully');

    } catch (err) {
        logger.error(`[Fees] getScholarshipData error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

async function gymSubscriptionDetails(req, res) {
    try {
        const studId = req.user.user_id;

        if (!studId) return sendError(res, 'Student ID is required', 400);

        logger.info(`[Fees] Fetching gym subscription for student: ${studId}`);

        const gymData = await FeesModel.gymSubscriptionData(studId);

        // console.log(gymData);

        return sendSuccess(res, gymData, 'Gym subscription fetched successfully');

    } catch (err) {
        logger.error(`[Fees] gymSubscriptionDetails error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

/**
 * ── Installment opt-in additions for feesController ─────────────────────────
 * `isAllowedInstallment` route/name stays the same — model logic upgraded.
 * Add these two new functions and export them alongside the existing ones.
 *
 * OTP reuses your existing student-auth pattern (otpSvc + notifSvc, mobile-based),
 * scoped with purpose='installment' so it doesn't collide with login OTPs.
 * Adjust the require paths below to wherever otpSvc/notifSvc actually live.
 */

// ─── POST /fees/installment/send-otp ────────────────────────────────────────

async function sendInstallmentOtp(req, res) {
    try {
        const studId = req.user.user_id;
        if (!studId) return sendError(res, 'Student ID is required', 400);

        const student = await FeesModel.getStudentCurrentSemester(studId);
        if (!student) return sendError(res, 'Student not found', 404);

        const mobile = student.stud_mobile;
        if (!mobile) return sendError(res, 'No mobile number on file', 400);

        const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const userAgent = req.headers['user-agent'] || '';

        logger.info(`[Fees] Sending installment OTP for student: ${studId}`);

        const otp = await otpSvc.createAndStore(mobile, ip, userAgent, 'installment');

        if (IS_DEV) {
            logger.debug(`[OTP:installment] DEV mode — OTP for ${mobile} is ${otp}`);
            return sendSuccess(res, {}, 'OTP sent successfully');
        }

        const results = await Promise.allSettled([
            notifSvc.sendWhatsApp(mobile, otp),
            notifSvc.sendSMS(mobile, otp),
        ]);

        const whatsappOk = results[0].status === 'fulfilled';
        const smsOk = results[1].status === 'fulfilled';

        if (!whatsappOk) logger.warn(`[OTP:installment] WhatsApp failed for ${mobile}: ${results[0].reason?.message}`);
        if (!smsOk) logger.warn(`[OTP:installment] SMS failed for ${mobile}: ${results[1].reason?.message}`);

        if (!whatsappOk && !smsOk) {
            return sendError(res, 'Failed to send OTP — please try again', 500);
        }

        return sendSuccess(res, {}, 'OTP sent successfully');
    } catch (err) {
        logger.error(`[Fees] sendInstallmentOtp error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

// ─── POST /fees/installment/save ────────────────────────────────────────────

async function verifyAndSaveInstallmentPlan(req, res) {
    try {
        const studId = req.user.user_id;
        const { noOfInstallments, otp } = req.body;

        if (!studId) return sendError(res, 'Student ID is required', 400);
        if (!noOfInstallments || !otp) return sendError(res, 'Missing required fields', 400);
        if (!/^\d{6}$/.test(otp)) return sendError(res, 'Enter a valid 6-digit OTP', 400);

        const student = await FeesModel.getStudentCurrentSemester(studId);
        if (!student) return sendError(res, 'Student not found', 404);
        const mobile = student.stud_mobile;

        const { valid, reason } = await otpSvc.verify(mobile, otp);
        if (!valid) return sendError(res, reason || 'Invalid or expired OTP', 401);

        await otpSvc.clearOTP(mobile);

        logger.info(`[Fees] Saving installment plan for student: ${studId}, count: ${noOfInstallments}`);

        const result = await FeesModel.saveInstallmentPlan(studId, noOfInstallments);

        if (!result.success) return sendError(res, result.message || 'Failed to save installment plan', 400);

        return sendSuccess(res, result, 'Installment plan saved successfully');
    } catch (err) {
        logger.error(`[Fees] verifyAndSaveInstallmentPlan error: ${err.message}`);
        return sendError(res, 'Internal server error', 500);
    }
}

module.exports = {
    getAllFees,
    isAllowedInstallment,
    getFeeSummary,
    getHostelFees,
    getTransportFees,
    getLibraryFine,
    getAdditionalFees,
    getInstallmentData,
    getScholarshipData,
    gymSubscriptionDetails,
    sendInstallmentOtp,
    verifyAndSaveInstallmentPlan,
};