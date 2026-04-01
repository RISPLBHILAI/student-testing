const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const Timetable = require('../../models/Timetable');

async function getTodayTimetable(req, res) {
    try {
        const studentId = req.user.user_id;

        if (!studentId) {
            return sendError(res, 'Student not registered. Timetable information not available.', 400);
        }

        logger.info(`[Timetable] Fetching today's timetable for student: ${studentId}`);

        const result = await Timetable.getTodayTimetable(studentId);
        const formattedTimetable = Timetable.formatTimetableData(result.timetable);

        return sendSuccess(res, {
            date: result.date,
            day: result.day,
            studentId,
            totalLectures: formattedTimetable.length,
            timetable: formattedTimetable
        }, "Today's timetable retrieved successfully", 200);

    } catch (error) {
        logger.error(`[Timetable] getTodayTimetable error: ${error.message}`);

        if (error.message === 'Student semester information not found') {
            return sendError(res, error.message, 404);
        }

        return sendError(res, 'Failed to fetch timetable information', 500);
    }
}

async function getWeekTimetable(req, res) {
    try {
        const studentId = req.user.user_id;
        const { startDate } = req.query;

        if (!studentId) {
            return sendError(res, 'Student not registered. Timetable information not available.', 400);
        }

        logger.info(`[Timetable] Fetching weekly timetable for student: ${studentId}${startDate ? `, week starting: ${startDate}` : ''}`);

        const weeklyResult = await Timetable.getWeekTimetable(studentId, startDate);

        const formattedWeeklyTimetable = weeklyResult.map(dayData => ({
            date: dayData.date,
            day: dayData.day,
            totalLectures: dayData.timetable.length,
            timetable: Timetable.formatTimetableData(dayData.timetable)
        }));

        return sendSuccess(res, {
            studentId,
            weekStartDate: weeklyResult[0]?.date || null,
            weekEndDate: weeklyResult[4]?.date || null,
            totalDays: formattedWeeklyTimetable.length,
            weeklyTimetable: formattedWeeklyTimetable
        }, "Weekly timetable retrieved successfully", 200);

    } catch (error) {
        logger.error(`[Timetable] getWeekTimetable error: ${error.message}`);

        if (error.message === 'Student semester information not found') {
            return sendError(res, error.message, 404);
        }

        return sendError(res, 'Failed to fetch weekly timetable information', 500);
    }
}

async function getTimetableByDate(req, res) {
    try {
        const studentId = req.user.user_id;
        const { date } = req.params;

        if (!studentId) {
            return sendError(res, 'Student not registered. Timetable information not available.', 400);
        }

        if (!date) {
            return sendError(res, 'Date parameter is required', 400);
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
            return sendError(res, 'Invalid date format. Use YYYY-MM-DD format', 400);
        }

        logger.info(`[Timetable] Fetching timetable for student: ${studentId}, date: ${date}`);

        const result = await Timetable.getTimetableForDate(studentId, date);
        const formattedTimetable = Timetable.formatTimetableData(result.timetable);

        return sendSuccess(res, {
            date: result.date,
            day: result.day,
            studentId,
            totalLectures: formattedTimetable.length,
            timetable: formattedTimetable
        }, "Timetable retrieved successfully", 200);

    } catch (error) {
        logger.error(`[Timetable] getTimetableByDate error: ${error.message}`);

        if (error.message === 'Student semester information not found') {
            return sendError(res, error.message, 404);
        }

        return sendError(res, 'Failed to fetch timetable information for the specified date', 500);
    }
}

async function getTimetableByDateRange(req, res) {
    try {
        const studentId = req.user.user_id;
        const { startDate, endDate } = req.query;

        if (!studentId) {
            return sendError(res, 'Student not registered. Timetable information not available.', 400);
        }

        if (!startDate || !endDate) {
            return sendError(res, 'Both startDate and endDate query parameters are required', 400);
        }

        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(startDate) || !dateRegex.test(endDate)) {
            return sendError(res, 'Invalid date format. Use YYYY-MM-DD format for both dates', 400);
        }

        if (new Date(startDate) > new Date(endDate)) {
            return sendError(res, 'Start date cannot be later than end date', 400);
        }

        logger.info(`[Timetable] Fetching timetable for student: ${studentId}, range: ${startDate} to ${endDate}`);

        const weeklyResult = await Timetable.getWeekTimetableByDateRange(studentId, startDate, endDate);

        const formattedWeeklyTimetable = weeklyResult.map(dayData => ({
            date: dayData.date,
            day: dayData.day,
            totalLectures: dayData.timetable.length,
            timetable: Timetable.formatTimetableData(dayData.timetable)
        }));

        return sendSuccess(res, {
            studentId,
            startDate,
            endDate,
            totalDays: formattedWeeklyTimetable.length,
            timetable: formattedWeeklyTimetable
        }, "Timetable range retrieved successfully", 200);

    } catch (error) {
        logger.error(`[Timetable] getTimetableByDateRange error: ${error.message}`);

        if (error.message === 'Student semester information not found') {
            return sendError(res, error.message, 404);
        }

        return sendError(res, 'Failed to fetch timetable information for the specified date range', 500);
    }
}

module.exports = {
    getTodayTimetable,
    getWeekTimetable,
    getTimetableByDate,
    getTimetableByDateRange
};