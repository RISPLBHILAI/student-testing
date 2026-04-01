const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const TimetableCtrl = require('../controllers/dashboard/timetable.controller');

// Get today's timetable
router.get(
    '/today',
    auth(),
    TimetableCtrl.getTodayTimetable
);

// Get current week's timetable (Monday to Friday)
// Optional query parameter: ?startDate=YYYY-MM-DD (to get specific week)
router.get(
    '/week',
    auth(),
    TimetableCtrl.getWeekTimetable
);

// Get timetable for a specific date
// Date format: YYYY-MM-DD
router.get(
    '/date/:date',
    auth(),
    TimetableCtrl.getTimetableByDate
);

// Get timetable for a custom date range
// Required query parameters: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
router.get(
    '/range',
    auth(),
    TimetableCtrl.getTimetableByDateRange
);

module.exports = router;