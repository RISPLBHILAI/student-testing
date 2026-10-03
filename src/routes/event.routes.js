
const router = require("express").Router();
const { auth } = require("../../../shared/middlewares/auth");
const eventCtrl = require("../controllers/event/event.controller");

router.get("/handoff-url", auth(), eventCtrl.handoffUrl);

module.exports = router;
