
const router = require("express").Router();
const { auth } = require("../../../shared/middlewares/auth");
const dashboardCtrl   = require("../controllers/dashboard/dashboard.controller");

router.get("/", auth(), dashboardCtrl.dashboard);

router.get("/subjects", auth(), dashboardCtrl.allSubjects);

router.get("/results", auth(), dashboardCtrl.studentResults);

module.exports = router;