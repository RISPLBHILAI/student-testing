const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const { getQuestionBank, getQuestionsSubjectWise } = require('../controllers/question/question.controller');

router.get('/', auth(), getQuestionBank);
router.get('/subject/:subjectId', auth(), getQuestionsSubjectWise);

module.exports = router;