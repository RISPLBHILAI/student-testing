const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const NotificationCtrl = require('../controllers/student/notification.controller');

/// Fetch notifications
router.get(
    '/',
    auth(),
    NotificationCtrl.getAllNotification
);

/// mark notification as read
router.put(
    '/mark-notification-read/:notificationId',
    auth(),
    NotificationCtrl.markNotificationRead
);

/// delete notification
router.delete(
    '/:notificationId',
    auth(),
    NotificationCtrl.deleteNotification
);

/// mark all notifications as read
router.post(
    '/mark-all-notification-read',
    auth(),
    NotificationCtrl.markAllNotificationRead);

module.exports = router;