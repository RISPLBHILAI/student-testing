const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const AttendenceCtrl = require('../controllers/dashboard/attendence.controller');

/// Fetch notifications
router.get(
    '/percentage',
    auth(),
    AttendenceCtrl.attendencePercentage
);

/// Get todays intime 
router.get(
    '/today-intime',
    auth(),
    AttendenceCtrl.todayInTime
);

// Get detailed attendance data for student
router.get(
    '/data',
    auth(),
    AttendenceCtrl.attendenceData
);

// Get attendance history/timeline
router.get(
    '/history',
    auth(),
    AttendenceCtrl.attendenceHistory
);

// Get monthly attendance calendar
router.get(
    '/monthly',
    auth(),
    AttendenceCtrl.monthlyAttendence
);

// Get lecture-wise attendance details for a single day (?date=YYYY-MM-DD)
router.get(
    '/lectures',
    auth(),
    AttendenceCtrl.lectureDetails
);


module.exports = router;