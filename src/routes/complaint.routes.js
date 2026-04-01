const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const {
    createComplaint,
    getComplaints,
    getComplaintDetails,
    deleteComplaint,
    getCategories,
    getStats
} = require('../controllers/complaint/complaint.controller');

router.post('/', auth(), createComplaint);
router.get('/', auth(), getComplaints);
router.get('/stats', auth(), getStats);
router.get('/categories', auth(), getCategories);
router.get('/:id', auth(), getComplaintDetails);
router.delete('/:id', auth(), deleteComplaint);

module.exports = router;