const router = require("express").Router();
const { auth } = require("../../../shared/middlewares/auth");
const {
    getActiveGatePass,
    generateGatePass,
    generateGateQr,
} = require("../controllers/gatepass/gatepass.controller");

router.get("/active", auth(), getActiveGatePass);
router.post("/", auth(), generateGatePass);
router.post("/:id/qr", auth(), generateGateQr);

module.exports = router;
