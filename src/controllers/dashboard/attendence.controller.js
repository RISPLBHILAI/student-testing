const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

const formatDateDMY = (dateStr) => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const [year, month, day] = dateStr.split('-'); // 👈 key fix
    const date = new Date(year, month - 1, day);   // LOCAL date

    const d = String(date.getDate()).padStart(2, '0');
    const m = months[date.getMonth()];
    const y = date.getFullYear();

    return `${d}-${m}-${y}`;
};

function toDateKey(date) {
    if (date instanceof Date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return String(date).slice(0, 10);
}

// ✅ Get today's date in IST
function getTodayIST() {
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // IST = UTC+5:30
    const ist = new Date(now.getTime() + istOffset);
    return ist.toISOString().slice(0, 10);
}

const today = getTodayIST();

async function attendencePercentage(req, res) {
    try {
        const studentId = req.user.user_id;

        if (!studentId) {
            return sendError(res, 'Student not registered. Attendance information not available.', 400,);
        }

        logger.info(`[Attendance] Fetching attendance percentage for student: ${studentId}`);

        const [currentSemRows] = await db.query(
            'SELECT stud_id, clg_id, cor_id, branch_id, sem_year_id FROM stud_current_sem_year WHERE stud_id = ? LIMIT 1',
            [studentId]
        );

        if (currentSemRows.length === 0) {
            return sendError(res, 'Student semester information not found', 400);
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = currentSemRows[0];

        const [sessionRows] = await db.query(
            `SELECT session, class_commencment_date, class_end_date
             FROM all_active_semester_year
             WHERE clg_id = ? AND cor_id = ? AND branch_id = ? AND sem_id = ? AND active_status = '1'
             LIMIT 1`,
            [clg_id, cor_id, branch_id, sem_year_id]
        );

        if (sessionRows.length === 0) {
            return sendError(res, 'Active semester session not found', 400);
        }

        const { session, class_commencment_date, class_end_date } = sessionRows[0];

        const today = getTodayIST();
        const fromDate = class_commencment_date;
        const toDate = today <= class_end_date ? today : class_end_date;

        const [attendanceRows] = await db.query(
            `SELECT
                SUM(CASE WHEN attendance_status = 'P' THEN 1 ELSE 0 END) AS total_present,
                SUM(CASE WHEN attendance_status = 'A' THEN 1 ELSE 0 END) AS total_absent,
                COUNT(*) AS total_classes,
                ROUND(
                    (SUM(CASE WHEN attendance_status = 'P' THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2
                ) AS attendance_percentage
             FROM class_wise_manual_attendance
             WHERE stud_id = ? AND DATE(attendance_date) BETWEEN ? AND ? AND session = ?`,
            [studentId, fromDate, toDate, session]
        );

        const attendanceData = attendanceRows[0];

        return sendSuccess(res, {
            studentId,
            session,
            dateRange: { from: fromDate, to: toDate },
            attendance: {
                percentage: parseFloat(attendanceData.attendance_percentage) || 0,
                totalClasses: parseInt(attendanceData.total_classes) || 0,
                presentClasses: parseInt(attendanceData.total_present) || 0,
                absentClasses: parseInt(attendanceData.total_absent) || 0
            }
        }
            , "Attendance percentage retrieved successfully",
            200
        );

    } catch (error) {
        logger.error(`[Attendance] attendencePercentage error: ${error.message}`);
        return sendError(res, 'Failed to fetch attendance information', 500);
    }
}

async function todayInTime(req, res) {
    try {
        const studentId = req.user.user_id;
        const date = req.query.date;

        const today = date ?? new Date().toISOString().split('T')[0];

        if (!studentId) {
            return sendError(res, 'Student not registered. Attendance information not available.', 400);
        }

        logger.info(`[Attendance] Fetching today in-time for student: ${studentId}`);

        const [studentRows] = await db.query(
            `SELECT tp.essl_id, scs.clg_id, scs.cor_id, scs.branch_id, scs.sem_year_id
             FROM tblstud_profile tp
             LEFT JOIN stud_current_sem_year scs ON tp.id = scs.stud_id
             WHERE tp.id = ? LIMIT 1`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student information not found', 400);
        }

        const { essl_id, clg_id, cor_id, branch_id, sem_year_id } = studentRows[0];

        if (!essl_id) {
            return sendError(res, 'ESSL ID not found for student', 400);
        }

        const [holidayRows] = await db.query(
            `SELECT holidayDate, description
             FROM holiday_master
             WHERE DATE(holidayDate) = ?
               AND ((clgId = ? AND corId = '0' AND branchId = '0' AND semId = '0')
                OR (clgId = ? AND corId = ? AND branchId = ? AND semId = ?))
               AND holidayDay != 'Sunday'`,
            [today, clg_id, clg_id, cor_id, branch_id, sem_year_id]
        );

        if (holidayRows.length > 0) {
            return sendSuccess(res, {
                date: today,
                attendanceStatus: 'holiday',
                inTime: null,
                outTime: null,
                holidayReason: holidayRows[0].description
            },
                "Today is a holiday",
                200
            );
        }

        const [attendanceRows] = await db.query(
            `SELECT
                DATE(DateOnly) as attendedDate,
                TIME(FirstLogDate) AS attendanceStartTime,
                TIME(LastLogDate) AS attendanceEndTime,
                FirstLogDate,
                LastLogDate
             FROM device_logs
             WHERE UserId = ? AND DATE(DateOnly) = ?
               AND DeviceCategory = 'institute' AND DeviceId != '21'
             GROUP BY DATE(DateOnly) LIMIT 1`,
            [essl_id, today]
        );

        if (attendanceRows.length > 0) {
            const att = attendanceRows[0];
            return sendSuccess(res, {
                date: today,
                attendanceStatus: 'present',
                inTime: att.attendanceStartTime,
                outTime: att.attendanceEndTime,
                firstLog: att.FirstLogDate,
                lastLog: att.LastLogDate
            },
                "Present",
                200
            );
        }

        // ✅ Fix #2: consistent argument order
        return sendSuccess(res, {
            date: today,
            attendanceStatus: 'absent',
            inTime: null,
            outTime: null
        },
            "Absent",
            200
        );

    } catch (error) {
        logger.error(`[Attendance] todayInTime error: ${error.message}`);
        return sendError(res, "Failed to fetch today's attendance information", 500);
    }
}

async function attendenceData(req, res) {
    try {
        const studentId = req.user.user_id;
        const { attendanceFromDate, attendanceToDate } = req.query;

        if (!studentId) {
            return sendError(res, 'Student not registered. Attendance information not available.', 400);
        }

        logger.info(`[Attendance] Fetching attendance data for student: ${studentId}`);

        const [currentSemRows] = await db.query(
            'SELECT stud_id, clg_id, cor_id, branch_id, sem_year_id FROM stud_current_sem_year WHERE stud_id = ? LIMIT 1',
            [studentId]
        );

        if (currentSemRows.length === 0) {
            return sendError(res, 'Student semester information not found', 400);
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = currentSemRows[0];

        const [sessionRows] = await db.query(
            `SELECT session, class_commencment_date, class_end_date
             FROM all_active_semester_year
             WHERE clg_id = ? AND cor_id = ? AND branch_id = ? AND sem_id = ? AND active_status = '1'
             LIMIT 1`,
            [clg_id, cor_id, branch_id, sem_year_id]
        );

        if (sessionRows.length === 0) {
            return sendError(res, 'Active semester session not found', 400);
        }

        const { session, class_commencment_date, class_end_date } = sessionRows[0];

        const today = new Date().toISOString().split('T')[0];
        let fromDate, toDate;

        if (attendanceFromDate && attendanceToDate &&
            attendanceFromDate >= class_commencment_date && attendanceFromDate <= class_end_date &&
            attendanceToDate >= class_commencment_date && attendanceToDate <= class_end_date) {
            fromDate = attendanceFromDate;
            toDate = attendanceToDate;
        } else {
            fromDate = class_commencment_date;
            toDate = today <= class_end_date ? today : class_end_date;
        }

        const [hostelRows] = await db.query(
            "SELECT * FROM hostel_allotment_log WHERE stud_id = ? AND allotment_status = '1'",
            [studentId]
        );
        const isHostelStudent = hostelRows.length > 0;

        const [esslRows] = await db.query(
            'SELECT essl_id, stud_name, stud_roll_no FROM tblstud_profile WHERE id = ? LIMIT 1',
            [studentId]
        );

        if (esslRows.length === 0) {
            return sendError(res, 'Student profile not found', 400);
        }

        const { essl_id, stud_name, stud_roll_no } = esslRows[0];

        const [holidayRows] = await db.query(
            `SELECT holidayDate, description
             FROM holiday_master
             WHERE DATE(holidayDate) BETWEEN ? AND ?
               AND ((clgId = ? AND corId = 0 AND branchId = 0 AND semId = 0)
                OR (clgId = ? AND corId = ? AND branchId = ? AND semId = ?))`,
            [fromDate, toDate, clg_id, clg_id, cor_id, branch_id, sem_year_id]
        );

        const holidays = {};

        holidayRows.forEach(row => {
            const date = new Date(row.holidayDate);

            const dateKey =
                date.getFullYear() +
                '-' +
                String(date.getMonth() + 1).padStart(2, '0') +
                '-' +
                String(date.getDate()).padStart(2, '0');

            holidays[dateKey] = row.description;
        });

        const dateRange = [];

        let [y, m, d] = fromDate.split('-').map(Number);
        const [endY, endM, endD] = toDate.split('-').map(Number);

        let current = new Date(y, m - 1, d);
        const end = new Date(endY, endM - 1, endD);

        while (current <= end) {
            const year = current.getFullYear();
            const month = String(current.getMonth() + 1).padStart(2, '0');
            const day = String(current.getDate()).padStart(2, '0');

            dateRange.push(`${year}-${month}-${day}`);

            current.setDate(current.getDate() + 1);
        }

        const [biometricRows] = await db.query(
            `SELECT UserId, DATE(DateOnly) as attendance_date
             FROM device_logs
             WHERE DATE(DateOnly) BETWEEN ? AND ? AND UserId = ? AND DeviceId != '21'
             GROUP BY UserId, DATE(DateOnly)`,
            [fromDate, toDate, essl_id]
        );

        const biometricData = {};
        biometricRows.forEach(row => {
            const dateKey = toDateKey(row.attendance_date);
            biometricData[dateKey] = 'P';
        });

        const [classRows] = await db.query(
            `SELECT
                DATE(attendance_date) as attendance_date,
                SUM(CASE WHEN attendance_status = 'P' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN attendance_status = 'A' THEN 1 ELSE 0 END) AS absent,
                COUNT(*) as total_classes
             FROM class_wise_manual_attendance
             WHERE stud_id = ? AND DATE(attendance_date) BETWEEN ? AND ? AND session = ?
             GROUP BY DATE(attendance_date)`,
            [studentId, fromDate, toDate, session]
        );

        const classData = {};
        classRows.forEach(row => {
            const dateKey = toDateKey(row.attendance_date);
            classData[dateKey] = {
                present: parseInt(row.present) || 0,
                absent: parseInt(row.absent) || 0,
                total: parseInt(row.total_classes) || 0
            };
        });

        const [overallClassRows] = await db.query(
            `SELECT
                SUM(CASE WHEN attendance_status = 'P' THEN 1 ELSE 0 END) AS total_present,
                COUNT(*) AS total_classes,
                ROUND(
                    (SUM(CASE WHEN attendance_status = 'P' THEN 1 ELSE 0 END) * 100.0) / COUNT(*), 2
                ) AS overall_attendance_percentage
             FROM class_wise_manual_attendance
             WHERE stud_id = ? AND DATE(attendance_date) BETWEEN ? AND ? AND session = ?`,
            [studentId, fromDate, toDate, session]
        );

        const overallClass = overallClassRows[0];

        let messData = {};
        let avgBreakfast = 0, avgLunch = 0, avgDinner = 0;

        if (isHostelStudent && essl_id) {
            const [messRows] = await db.query(
                `SELECT DATE(DateOnly) as attendance_date, BreakFastLogDate, LunchLogDate, DinnerLogDate
                 FROM device_logs_mess
                 WHERE UserId = ? AND DATE(DateOnly) BETWEEN ? AND ?`,
                [essl_id, fromDate, toDate]
            );

            let breakfastTotal = 0, breakfastPresent = 0;
            let lunchTotal = 0, lunchPresent = 0;
            let dinnerTotal = 0, dinnerPresent = 0;

            messRows.forEach(row => {
                const dateKey = toDateKey(row.attendance_date);
                const isBreakfastPresent = row.BreakFastLogDate && row.BreakFastLogDate !== 'Absent';
                const isLunchPresent = row.LunchLogDate && row.LunchLogDate !== 'Absent';
                const isDinnerPresent = row.DinnerLogDate && row.DinnerLogDate !== 'Absent';

                messData[dateKey] = {
                    breakfast: isBreakfastPresent ? 'Present' : 'Absent',
                    lunch: isLunchPresent ? 'Present' : 'Absent',
                    dinner: isDinnerPresent ? 'Present' : 'Absent'
                };

                breakfastTotal++; if (isBreakfastPresent) breakfastPresent++;
                lunchTotal++; if (isLunchPresent) lunchPresent++;
                dinnerTotal++; if (isDinnerPresent) dinnerPresent++;
            });

            avgBreakfast = breakfastTotal > 0 ? Math.round((breakfastPresent / breakfastTotal) * 10000) / 100 : 0;
            avgLunch = lunchTotal > 0 ? Math.round((lunchPresent / lunchTotal) * 10000) / 100 : 0;
            avgDinner = dinnerTotal > 0 ? Math.round((dinnerPresent / dinnerTotal) * 10000) / 100 : 0;
        }

        const [clockInRows] = await db.query(
            `SELECT TIME(FirstLogDate) AS first_in_time
             FROM device_logs
             WHERE UserId = ? AND DATE(DateOnly) = ? AND DeviceId != '21'
             ORDER BY FirstLogDate ASC LIMIT 1`,
            [essl_id, today]
        );

        const todayClockIn = clockInRows.length > 0 ? clockInRows[0].first_in_time : null;

        const finalData = dateRange.map(date => ({
            date: formatDateDMY(date),
            dateRaw: date,
            holidayFor: holidays[date] || '',
            biometric: biometricData[date] || 'A',
            class_present: classData[date]?.present || 0,
            class_absent: classData[date]?.absent || 0,
            total_classes: classData[date]?.total || 0,
            breakfast: messData[date]?.breakfast || 'Absent',
            lunch: messData[date]?.lunch || 'Absent',
            dinner: messData[date]?.dinner || 'Absent',
            is_hosteller: isHostelStudent ? 'Yes' : 'No'
        }));

        const totalClasses = parseInt(overallClass.total_classes) || 0;
        const totalPresent = parseInt(overallClass.total_present) || 0;
        const percentage = parseFloat(overallClass.overall_attendance_percentage) || 0;

        logger.info(`[Attendance] Data fetched for student: ${studentId}, percentage: ${percentage}%`);

        return sendSuccess(res, {
            studentId,
            studentName: stud_name,
            isHosteller: isHostelStudent,
            todayClockIn,
            attendancePercentage: Math.round(percentage),
            session,
            dateRange: { from: fromDate, to: toDate },
            status: percentage >= 75 ? 'Good' : percentage >= 60 ? 'Warning' : 'Critical',
            lastUpdated: new Date().toISOString(),
            attendanceData: {
                total_classes: totalClasses.toString(),
                total_present: totalPresent.toString(),
                overall_attendance_percentage: percentage.toString(),
                average_breakfast_attendance: avgBreakfast,
                average_lunch_attendance: avgLunch,
                average_dinner_attendance: avgDinner
            },
            finalData,
            holidays
        },
            "Attendance data retrieved successfully",
            200
        );

    } catch (error) {
        logger.error(`[Attendance] attendenceData error: ${error.message}`);
        return sendError(res, "Failed to fetch attendance data", 500);
    }
}

async function attendenceHistory(req, res) {
    try {
        const studentId = req.user.user_id;
        const { limit = 30, offset = 0 } = req.query;

        if (!studentId) {
            return sendError(res, 'Student not registered. Attendance information not available.', 400);
        }

        logger.info(`[Attendance] Fetching attendance history for student: ${studentId}`);

        const [currentSemRows] = await db.query(
            'SELECT clg_id, cor_id, branch_id, sem_year_id FROM stud_current_sem_year WHERE stud_id = ? LIMIT 1',
            [studentId]
        );

        if (currentSemRows.length === 0) {
            return sendError(res, 'Student semester information not found', 400);
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = currentSemRows[0];

        const [sessionRows] = await db.query(
            `SELECT session FROM all_active_semester_year
             WHERE clg_id = ? AND cor_id = ? AND branch_id = ? AND sem_id = ? AND active_status = '1'
             LIMIT 1`,
            [clg_id, cor_id, branch_id, sem_year_id]
        );

        const session = sessionRows.length > 0 ? sessionRows[0].session : null;

        let historyQuery = `
            SELECT
                DATE(attendance_date) as attendance_date,
                COUNT(*) as classes_on_date,
                SUM(CASE WHEN attendance_status = 'P' THEN 1 ELSE 0 END) as present_classes,
                SUM(CASE WHEN attendance_status = 'A' THEN 1 ELSE 0 END) as absent_classes
            FROM class_wise_manual_attendance
            WHERE stud_id = ?`;

        const params = [studentId];

        if (session) {
            historyQuery += ' AND session = ?';
            params.push(session);
        }

        historyQuery += ' GROUP BY DATE(attendance_date) ORDER BY attendance_date DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), parseInt(offset));

        const [historyRows] = await db.query(historyQuery, params);

        const history = historyRows.map(row => ({
            date: row.attendance_date,
            status: row.present_classes > 0 ? 'present' : 'absent',
            classesOnDate: row.classes_on_date,
            presentClasses: row.present_classes,
            absentClasses: row.absent_classes,
            attendanceRate: Math.round((row.present_classes / row.classes_on_date) * 100),
            day: new Date(row.attendance_date).toLocaleDateString('en-US', { weekday: 'long' })
        }));

        return sendSuccess(res, {
            history,
            pagination: {
                limit: parseInt(limit),
                offset: parseInt(offset),
                total: history.length
            }
        },
            "Attendance history retrieved successfully",
            200
        );

    } catch (error) {
        logger.error(`[Attendance] attendenceHistory error: ${error.message}`);
        return sendError(res, "Failed to fetch attendance history", 500);
    }
}

async function monthlyAttendence(req, res) {
    try {
        const studentId = req.user.user_id;
        const { month, year } = req.query;

        if (!studentId) {
            return sendError(res, 'Student not registered. Attendance information not available.', 400);
        }

        const currentDate = new Date();
        const targetMonth = month || (currentDate.getMonth() + 1);
        const targetYear = year || currentDate.getFullYear();

        logger.info(`[Attendance] Fetching monthly attendance for student: ${studentId}, ${targetMonth}/${targetYear}`);

        const [currentSemRows] = await db.query(
            'SELECT clg_id, cor_id, branch_id, sem_year_id FROM stud_current_sem_year WHERE stud_id = ? LIMIT 1',
            [studentId]
        );

        if (currentSemRows.length === 0) {
            return sendError(res, 'Student semester information not found', 400);
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = currentSemRows[0];

        const [sessionRows] = await db.query(
            `SELECT session FROM all_active_semester_year
             WHERE clg_id = ? AND cor_id = ? AND branch_id = ? AND sem_id = ? AND active_status = '1'
             LIMIT 1`,
            [clg_id, cor_id, branch_id, sem_year_id]
        );

        const session = sessionRows.length > 0 ? sessionRows[0].session : null;

        let monthlyQuery = `
            SELECT
                DAY(attendance_date) as day,
                DATE(attendance_date) as attendance_date,
                COUNT(*) as total_classes,
                SUM(CASE WHEN attendance_status = 'P' THEN 1 ELSE 0 END) as present_classes,
                SUM(CASE WHEN attendance_status = 'A' THEN 1 ELSE 0 END) as absent_classes
            FROM class_wise_manual_attendance
            WHERE stud_id = ? AND MONTH(attendance_date) = ? AND YEAR(attendance_date) = ?`;

        const params = [studentId, targetMonth, targetYear];

        if (session) {
            monthlyQuery += ' AND session = ?';
            params.push(session);
        }

        monthlyQuery += ' GROUP BY DATE(attendance_date) ORDER BY attendance_date ASC';

        const [monthlyRows] = await db.query(monthlyQuery, params);

        const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();
        const calendar = Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1;
            const dayData = monthlyRows.find(row => row.day === day);
            return {
                day,
                date: `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
                status: dayData ? (dayData.present_classes > 0 ? 'present' : 'absent') : null,
                totalClasses: dayData ? dayData.total_classes : 0,
                presentClasses: dayData ? dayData.present_classes : 0,
                absentClasses: dayData ? dayData.absent_classes : 0,
                attendanceRate: dayData ? Math.round((dayData.present_classes / dayData.total_classes) * 100) : null,
                isWeekend: new Date(targetYear, targetMonth - 1, day).getDay() % 6 === 0
            };
        });

        const workingDays = monthlyRows.length;
        const presentDays = monthlyRows.filter(row => row.present_classes > 0).length;
        const totalClassesInMonth = monthlyRows.reduce((sum, row) => sum + row.total_classes, 0);
        const totalPresentClasses = monthlyRows.reduce((sum, row) => sum + row.present_classes, 0);

        return sendSuccess(res, {
            month: targetMonth,
            year: targetYear,
            calendar,
            summary: {
                totalDays: daysInMonth,
                workingDays,
                presentDays,
                absentDays: workingDays - presentDays,
                totalClasses: totalClassesInMonth,
                totalPresentClasses,
                monthlyAttendanceRate: workingDays > 0 ? Math.round((presentDays / workingDays) * 100) : 0
            }
        },
            "Monthly attendance retrieved successfully",
            200
        );

    } catch (error) {
        logger.error(`[Attendance] monthlyAttendence error: ${error.message}`);
        return sendError(res, "Failed to fetch monthly attendance", 500);
    }
}

module.exports = {
    attendencePercentage,
    todayInTime,
    attendenceData,
    attendenceHistory,
    monthlyAttendence
};