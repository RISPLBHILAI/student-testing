const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const {
    getQuestionBank,
    getQuestionsSubjectWise,
    getMcqTests,
    startMcqTest,
    submitMcqTest,
    getMcqTestResult,
} = require('../controllers/question/question.controller');

router.get('/', auth(), getQuestionBank);
router.get('/subject/:subjectId', auth(), getQuestionsSubjectWise);

// ── MCQ tests (scheduled from the RPS Online Quiz Portal) ──
router.get('/mcq-tests', auth(), getMcqTests);
router.get('/mcq-tests/:testId', auth(), startMcqTest);
router.post('/mcq-tests/:testId/submit', auth(), submitMcqTest);
router.get('/mcq-tests/:testId/result', auth(), getMcqTestResult);

module.exports = router;
