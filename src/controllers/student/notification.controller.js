const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

async function notification(req, res) {
    try {
        const studentId = req.user.user_id;
        if (!studentId) {
            return sendError(res, "Student ID not found in session", 401);
        }

        const limit = parseInt(req.query.limit) || 10;
        const lastId = parseInt(req.query.lastId) || null; // cursor

        const params = [studentId];
        let cursorClause = '';

        if (lastId) {
            cursorClause = 'AND id < ?';
            params.push(lastId);
        }

        params.push(limit + 1); // fetch one extra to check if there's a next page

        const [[{ total }]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM notification_portal.notifications
             WHERE platform = 'STUD'
               AND user_type = 'student'
               AND (user_id = ? OR user_id = 0)`,
            [studentId]
        );

        const [[{ unread_count }]] = await db.query(
            `SELECT COUNT(*) AS unread_count
             FROM notification_portal.notifications
             WHERE platform = 'STUD'
               AND user_type = 'student'
               AND (user_id = ? OR user_id = 0)
               AND read_status = 0`,
            [studentId]
        );

        const [notifications] = await db.query(
            `SELECT 
                id, heading, sub_heading, description,
                read_status, sent_at, icon, image_url, media
             FROM notification_portal.notifications
             WHERE platform = 'STUD'
               AND user_type = 'student'
               AND (user_id = ? OR user_id = 0)
               ${cursorClause}
             ORDER BY read_status ASC, id DESC
             LIMIT ?`,
            params
        );

        const hasMore = notifications.length > limit;
        const data = hasMore ? notifications.slice(0, limit) : notifications;
        const nextCursor = hasMore ? data[data.length - 1].id : null;

        return sendSuccess(res, {
            total,
            unread_count,
            notifications: data,
            hasMore,
            nextCursor,      // frontend passes this as lastId in the next request
        }, "Notifications fetched successfully", 200);

    } catch (err) {
        logger.error(`[Notification:student] getAllNotification error: ${err.message}`);
        return sendError(res, "Failed to fetch notifications", 500);
    }
}

async function markNotificationRead(req, res) {
    try {
        const studentId = req.user.user_id;
        const { notificationId } = req.params;

        if (!studentId) {
            return sendError(res, "Student ID not found", 401);
        }
        if (!notificationId) {
            return sendError(res, "Notification Id is undefined", 400);
        }

        const [result] = await db.query(
            `UPDATE notification_portal.notifications
                SET read_status = 1
                WHERE id = ?
                    AND (user_id = ? OR user_id = 0)
                    AND user_type = 'student'
                    AND platform = 'STUD'
            `,
            [notificationId, studentId]
        );

        if (result.affectedRows === 0) {
            return sendError(res, "Notification not found or already marked.", 400);
        }

        return sendSuccess(res, null, "Notification marked Succesfully.", 200);

    } catch (err) {
        logger.error(`[Notification:student] markNotfication error: ${err.message}`);
        return sendError(res, "Failed to mark notifications", 500);
    }
}

async function unreadCount(req, res) {
    try {
        const studentId = req.user.user_id;

        if (!studentId) {
            return sendError(res, "Student ID not found", 401);
        }

        const [rows] = await db.query(
            `SELECT 
                COUNT(*) AS unread_count
             FROM notification_portal.notifications
             WHERE platform = 'STUD'
               AND user_type = 'student'
               AND (user_id = ? OR user_id = 0)
               AND read_status = 0`,
            [studentId]
        );

        const unread_count = rows[0]?.unread_count || 0;

        return sendSuccess(
            res,
            { unread_count },
            "Unread notification count fetched successfully",
            200
        );

    } catch (err) {
        logger.error(`[Notification:student] unreadCount error: ${err.message}`);
        return sendError(res, "Failed to fetch unread count", 500);
    }
}

async function markAllNotificationRead(req, res) {
    try {
        const studentId = req.user.user_id;

        if (!studentId) {
            return sendError(res, "Student ID not found", 401);
        }

        const [result] = await db.query(
            `UPDATE notification_portal.notifications
                SET read_status = 1
                WHERE (user_id = ? OR user_id = 0)
                    AND read_status != 1
                    AND user_type = 'student'
                    AND platform = 'STUD'
            `,
            [studentId]
        );

        if (result.affectedRows === 0) {
            return sendError(res, "Notification not found or already marked.", 400);
        }

        return sendSuccess(res, null, "Notification marked Succesfully.", 200);

    } catch (err) {
        logger.error(`[Notification:student] markNotfication error: ${err.message}`);
        return sendError(res, "Failed to mark notifications", 500);
    }
}

async function deleteNotification(req, res) {
    try {
        const { notificationId } = req.params;
        const studentId = req.user.user_id;

        if (!studentId) {
            return sendError(res, "Student ID not found", 401);
        }
        if (!notificationId) {
            return sendError(res, "Notification Id is undefined", 400);
        }

        const [result] = await db.query(
            `UPDATE notification_portal.notifications
                SET is_active = 0
                WHERE id = ?
                    AND (user_id = ? OR user_id = 0)
                    AND user_type = 'student'
                    AND platform = 'STUD'
            `,
            [notificationId, studentId]
        );

        if (result.affectedRows === 0) {
            return sendError(res, "Notification not deleted", 400);
        }

        return sendSuccess(res, null, `Notification for id: ${notificationId} is deleted successfully.`);

    } catch (err) {
        logger.error(`[Notification:student] deleteNotfication error: ${err.message}`);
        return sendError(res, "Failed to delete notifications", 500);
    }
}

module.exports = { notification, markNotificationRead, deleteNotification, markAllNotificationRead, unreadCount };