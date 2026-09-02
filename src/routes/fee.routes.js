const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const {
    getAllFees,
    isAllowedInstallment,
    getFeeSummary,
    getHostelFees,
    getTransportFees,
    getLibraryFine,
    getAdditionalFees,
    getInstallmentData,
    getScholarshipData,
    gymSubscriptionDetails,
    sendInstallmentOtp,
    verifyAndSaveInstallmentPlan,
} = require('../controllers/fee/fees.controller');

const { getBaseFees, getMonthlyFeesDetails } = require('../controllers/fee/rpsFee.controller');

const { getAllPaidFees } = require('../controllers/fee/receipt.controller');

router.get('/all', auth(), getAllFees);
router.get('/is-installment', auth(), isAllowedInstallment);
router.get('/summary', auth(), getFeeSummary);
router.get('/hostel', auth(), getHostelFees);
router.get('/transport', auth(), getTransportFees);
router.get('/library', auth(), getLibraryFine);
router.get('/additional', auth(), getAdditionalFees);
router.get('/installment-data', auth(), getInstallmentData);
router.get('/scholarship/:semId', auth(), getScholarshipData);
router.get('/gym', auth(), gymSubscriptionDetails);

// Installment opt-in
router.post('/installment/send-otp', auth(), sendInstallmentOtp);
router.post('/installment/save', auth(), verifyAndSaveInstallmentPlan);

/// RPS routes
router.get('/rps/base', auth(), getBaseFees);
router.get('/rps/monthly', auth(), getMonthlyFeesDetails);

/// Receipt routes
router.get('/paid-fees', auth(), getAllPaidFees);

module.exports = router;