const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const { notes, notesBySubject } = require('../controllers/notes/notes.controller');

router.get('/', auth(), notes);
router.get('/subject/:subjectId', auth(), notesBySubject);

module.exports = router;