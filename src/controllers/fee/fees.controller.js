const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const FeesModel = require('../../models/feesModel');

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

        console.log(gymData);

        return sendSuccess(res, gymData, 'Gym subscription fetched successfully');

    } catch (err) {
        logger.error(`[Fees] gymSubscriptionDetails error: ${err.message}`);
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
    gymSubscriptionDetails
};