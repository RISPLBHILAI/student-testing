const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const { searchBooks, requestBook, getRequestedBooks, getStudentBooks } = require('../controllers/library/library.controller');

router.post('/search', auth(), searchBooks);
router.post('/request-books', auth(), requestBook);
router.get('/my-requested-books', auth(), getRequestedBooks);
router.get('/status', auth(), getStudentBooks);

module.exports = router;