const router = require("express").Router();
const studentCtrl = require('../controllers/student/student.controller');
const { auth } = require("../../../shared/middlewares/auth");

// Get student profile
router.get('/profile', auth(), studentCtrl.profile);

module.exports = router;