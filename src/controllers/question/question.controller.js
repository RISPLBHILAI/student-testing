const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

async function getQuestionBank(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[QuestionBank] Fetching question bank for student: ${studentId}`);

        const [studentRows] = await db.query(
            `SELECT clg_id, cor_id, branch_id, sem_year_id AS sem_id 
             FROM stud_current_sem_year WHERE stud_id = ?`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_id } = studentRows[0];

        const [sessionRows] = await db.query(
            `SELECT session FROM all_active_semester_year
             WHERE clg_id = ? AND cor_id = ? AND branch_id = ? AND sem_id = ?
             ORDER BY session DESC LIMIT 1`,
            [clg_id, cor_id, branch_id, sem_id]
        );

        if (sessionRows.length === 0) {
            return sendError(res, 'Session not found', 404);
        }

        const session = sessionRows[0].session;

        const [questions] = await db.query(
            `SELECT
                COUNT(qb.qb_id) AS q_count,
                qb.session_id,
                qb.subject_id,
                sa.subject_name
             FROM question_bank qb
             LEFT JOIN subject_allotment sa ON qb.subject_id = sa.id
             WHERE qb.clg_id = ? AND qb.cor_id = ? AND qb.branch_id = ?
               AND qb.sem_id = ? AND sa.is_active = 1 AND qb.session_id = ?
             GROUP BY qb.subject_id, qb.session_id
             ORDER BY sa.subject_name, qb.session_id ASC`,
            [clg_id, cor_id, branch_id, sem_id, session]
        );

        logger.info(`[QuestionBank] Found ${questions.length} subjects for student: ${studentId}`);

        return sendSuccess(res, {
            studentId,
            session,
            questions
        }, 'Question bank fetched successfully');

    } catch (err) {
        logger.error(`[QuestionBank] getQuestionBank error: ${err.message}`);
        return sendError(res, 'Failed to fetch question bank', 500);
    }
}

async function getQuestionsSubjectWise(req, res) {
    try {
        const studentId = req.user.user_id;
        const { subjectId } = req.params;

        if (!subjectId) {
            return sendError(res, 'Subject ID is required', 400);
        }

        logger.info(`[QuestionBank] Fetching subject questions for student: ${studentId}, subject: ${subjectId}`);

        const [studentRows] = await db.query(
            `SELECT clg_id, cor_id, branch_id, sem_year_id AS sem_id
             FROM stud_current_sem_year WHERE stud_id = ?`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_id } = studentRows[0];

        const [sessionRows] = await db.query(
            `SELECT session FROM all_active_semester_year
             WHERE clg_id = ? AND cor_id = ? AND branch_id = ? AND sem_id = ?
             ORDER BY session DESC LIMIT 1`,
            [clg_id, cor_id, branch_id, sem_id]
        );

        if (sessionRows.length === 0) {
            return sendError(res, 'Session not found', 404);
        }

        const session = sessionRows[0].session;

        const [units] = await db.query(
            `SELECT DISTINCT qb.subject_id, sa.subject_name, qb.unit_id, stu.unit_number, stu.unit_name
             FROM question_bank qb
             LEFT JOIN subject_allotment sa ON qb.subject_id = sa.id
             LEFT JOIN subject_to_unit stu ON qb.unit_id = stu.id
             WHERE qb.clg_id = ? AND qb.cor_id = ? AND qb.branch_id = ?
               AND qb.sem_id = ? AND qb.session_id = ? AND qb.subject_id = ? AND sa.is_active = 1
             ORDER BY stu.unit_number`,
            [clg_id, cor_id, branch_id, sem_id, session, subjectId]
        );

        if (units.length === 0) {
            return sendError(res, 'No units found for this subject', 404);
        }

        const subjectName = units[0].subject_name;
        const unitsWithQuestions = [];

        for (const unit of units) {
            const [questions] = await db.query(
                `SELECT * FROM question_bank
                 WHERE clg_id = ? AND cor_id = ? AND branch_id = ? AND sem_id = ?
                   AND session_id = ? AND subject_id = ? AND unit_id = ?
                 ORDER BY qb_id ASC`,
                [clg_id, cor_id, branch_id, sem_id, session, subjectId, unit.unit_id]
            );

            unitsWithQuestions.push({
                unit_id: unit.unit_id,
                unit_number: unit.unit_number,
                unit_name: unit.unit_name,
                questions: questions.map(q => ({
                    id: q.qb_id,
                    question: q.question,
                    answer: q.answer,
                    marks: q.marks,
                    questionType: q.que_type,
                    mcqOptions: q.que_type === 'MCQ' ? {
                        type: q.mcq_answer_type,
                        options: [q.option1, q.option2, q.option3, q.option4],
                        images: [q.img_option1, q.img_option2, q.img_option3, q.img_option4]
                    } : null,
                    questionImage: q.que_img
                }))
            });
        }

        logger.info(`[QuestionBank] Found ${unitsWithQuestions.length} units for subject: ${subjectId}`);

        return sendSuccess(res, {
            studentId,
            session,
            subject_id: parseInt(subjectId),
            subject_name: subjectName,
            units: unitsWithQuestions
        }, 'Subject questions fetched successfully');

    } catch (err) {
        logger.error(`[QuestionBank] getQuestionsSubjectWise error: ${err.message}`);
        return sendError(res, 'Failed to fetch subject questions', 500);
    }
}


// ─────────────────────────────────────────────────────────────────────────────
// MCQ TESTS
// Tests    : tbl_test_master (created from the RPS Online Quiz Portal)
// Questions: question_bank (que_type = 'MCQ') for the test's subject
// Answers  : student_assesment_test_answer (one row per question)
// ─────────────────────────────────────────────────────────────────────────────

async function getMcqTests(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[McqTest] Fetching tests for student: ${studentId}`);

        const [studentRows] = await db.query(
            `SELECT clg_id, cor_id, branch_id, sem_year_id AS sem_id
             FROM stud_current_sem_year WHERE stud_id = ?`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_id } = studentRows[0];

        const [tests] = await db.query(
            `SELECT
                t.id AS test_id, t.test_name, t.subject_id, sa.subject_name,
                DATE_FORMAT(t.test_date, '%Y-%m-%d') AS test_date,
                t.test_start_time, t.test_end_time, t.test_duration,
                CASE
                    WHEN NOW() < TIMESTAMP(t.test_date, t.test_start_time) THEN 'upcoming'
                    WHEN NOW() > TIMESTAMP(t.test_date, t.test_end_time)   THEN 'ended'
                    ELSE 'live'
                END AS status,
                (SELECT COUNT(*) FROM student_assesment_test_answer a
                  WHERE a.test_id = t.id AND a.student_id = ?) > 0 AS is_submitted
             FROM tbl_test_master t
             LEFT JOIN subject_allotment sa ON sa.id = t.subject_id
             WHERE t.clg_id = ? AND t.cor_id = ? AND t.branch_id = ? AND t.sem_id = ?
               AND t.test_date >= CURDATE()
             ORDER BY t.test_date, t.test_start_time`,
            [studentId, clg_id, cor_id, branch_id, sem_id]
        );

        logger.info(`[McqTest] Found ${tests.length} tests for student: ${studentId}`);

        return sendSuccess(res, { studentId, tests }, 'MCQ tests fetched successfully');

    } catch (err) {
        logger.error(`[McqTest] getMcqTests error: ${err.message}`);
        return sendError(res, 'Failed to fetch MCQ tests', 500);
    }
}

async function startMcqTest(req, res) {
    try {
        const studentId = req.user.user_id;
        const { testId } = req.params;

        if (!testId) {
            return sendError(res, 'Test ID is required', 400);
        }

        logger.info(`[McqTest] Start test: ${testId} for student: ${studentId}`);

        const [testRows] = await db.query(
            `SELECT t.id, t.test_name, t.subject_id, t.test_duration,
                    TIMESTAMP(t.test_date, t.test_end_time) AS ends_at,
                    NOW() < TIMESTAMP(t.test_date, t.test_start_time) AS not_started,
                    NOW() > TIMESTAMP(t.test_date, t.test_end_time)   AS has_ended
             FROM tbl_test_master t
             JOIN stud_current_sem_year s
               ON s.stud_id = ? AND s.clg_id = t.clg_id AND s.cor_id = t.cor_id
              AND s.branch_id = t.branch_id AND s.sem_year_id = t.sem_id
             WHERE t.id = ?`,
            [studentId, testId]
        );

        if (testRows.length === 0) {
            return sendError(res, 'Test not found', 404);
        }

        const test = testRows[0];

        if (test.not_started) {
            return sendError(res, 'Test has not started yet', 403);
        }
        if (test.has_ended) {
            return sendError(res, 'Test has ended', 403);
        }

        const [submitted] = await db.query(
            `SELECT id FROM student_assesment_test_answer WHERE test_id = ? AND student_id = ? LIMIT 1`,
            [testId, studentId]
        );

        if (submitted.length > 0) {
            return sendError(res, 'You have already submitted this test', 409);
        }

        // RAND(seed) gives each student their own fixed shuffled order
        const [questions] = await db.query(
            `SELECT qb_id, question, que_img, marks, mcq_answer_type,
                    option1, option2, option3, option4,
                    img_option1, img_option2, img_option3, img_option4
             FROM question_bank
             WHERE subject_id = ? AND que_type = 'MCQ'
             ORDER BY RAND(?)`,
            [test.subject_id, Number(studentId) * 100000 + Number(testId)]
        );

        if (questions.length === 0) {
            return sendError(res, 'No questions found for this test', 404);
        }

        logger.info(`[McqTest] Sent ${questions.length} questions for test: ${testId}`);

        return sendSuccess(res, {
            test_id: test.id,
            test_name: test.test_name,
            test_duration: test.test_duration,
            ends_at: test.ends_at,
            total_questions: questions.length,
            questions: questions.map((q, i) => ({
                sl_no: i + 1,
                id: q.qb_id,
                question: q.question,
                questionImage: q.que_img,
                marks: q.marks || 1,
                type: q.mcq_answer_type,
                options: [q.option1, q.option2, q.option3, q.option4],
                images: [q.img_option1, q.img_option2, q.img_option3, q.img_option4]
            }))
        }, 'Test started successfully');

    } catch (err) {
        logger.error(`[McqTest] startMcqTest error: ${err.message}`);
        return sendError(res, 'Failed to start test', 500);
    }
}

// Body: { answers: [{ question_id: 123, answer: 2 }] }   answer = option number 1-4
async function submitMcqTest(req, res) {
    try {
        const studentId = req.user.user_id;
        const { testId } = req.params;
        const answers = req.body.answers || [];

        if (!testId) {
            return sendError(res, 'Test ID is required', 400);
        }

        logger.info(`[McqTest] Submit test: ${testId} for student: ${studentId}`);

        const [testRows] = await db.query(
            `SELECT t.id, t.subject_id,
                    NOW() > TIMESTAMP(t.test_date, t.test_end_time) + INTERVAL 2 MINUTE AS time_over
             FROM tbl_test_master t
             JOIN stud_current_sem_year s
               ON s.stud_id = ? AND s.clg_id = t.clg_id AND s.cor_id = t.cor_id
              AND s.branch_id = t.branch_id AND s.sem_year_id = t.sem_id
             WHERE t.id = ?`,
            [studentId, testId]
        );

        if (testRows.length === 0) {
            return sendError(res, 'Test not found', 404);
        }

        const test = testRows[0];

        if (test.time_over) {
            return sendError(res, 'Submission time is over', 403);
        }

        const [submitted] = await db.query(
            `SELECT id FROM student_assesment_test_answer WHERE test_id = ? AND student_id = ? LIMIT 1`,
            [testId, studentId]
        );

        if (submitted.length > 0) {
            return sendError(res, 'You have already submitted this test', 409);
        }

        // Same order the student saw
        const [questions] = await db.query(
            `SELECT qb_id, question, marks, mcq_answer, option1, option2, option3, option4
             FROM question_bank
             WHERE subject_id = ? AND que_type = 'MCQ'
             ORDER BY RAND(?)`,
            [test.subject_id, Number(studentId) * 100000 + Number(testId)]
        );

        let score = 0;
        let totalMarks = 0;
        let correct = 0;
        const rows = [];

        questions.forEach((q, i) => {
            const given = answers.find(a => String(a.question_id) === String(q.qb_id));
            const answer = given ? String(given.answer) : null;
            const marks = q.marks || 1;
            const isCorrect = answer !== null && answer === String(q.mcq_answer).trim();

            totalMarks += marks;
            if (isCorrect) {
                score += marks;
                correct++;
            }

            rows.push([
                studentId, testId, test.subject_id, q.qb_id, i + 1,
                q.question, q.option1, q.option2, q.option3, q.option4,
                answer, q.mcq_answer, req.ip, new Date(), 'APP', isCorrect ? marks : 0
            ]);
        });

        await db.query(
            `INSERT INTO student_assesment_test_answer
                (student_id, test_id, subject_id, question_id, slno,
                 question, option_a, option_b, option_c, option_d,
                 submitted_answer, correct_ans, ipaddress, date_time_of_submission, test_code, mark_obtained)
             VALUES ?`,
            [rows]
        );

        logger.info(`[McqTest] Student ${studentId} scored ${score}/${totalMarks} in test: ${testId}`);

        return sendSuccess(res, {
            test_id: Number(testId),
            total_questions: questions.length,
            correct,
            score,
            total_marks: totalMarks
        }, 'Test submitted successfully');

    } catch (err) {
        logger.error(`[McqTest] submitMcqTest error: ${err.message}`);
        return sendError(res, 'Failed to submit test', 500);
    }
}

async function getMcqTestResult(req, res) {
    try {
        const studentId = req.user.user_id;
        const { testId } = req.params;

        if (!testId) {
            return sendError(res, 'Test ID is required', 400);
        }

        logger.info(`[McqTest] Result of test: ${testId} for student: ${studentId}`);

        const [testRows] = await db.query(
            `SELECT t.id, t.test_name, NOW() > TIMESTAMP(t.test_date, t.test_end_time) AS has_ended
             FROM tbl_test_master t
             JOIN stud_current_sem_year s
               ON s.stud_id = ? AND s.clg_id = t.clg_id AND s.cor_id = t.cor_id
              AND s.branch_id = t.branch_id AND s.sem_year_id = t.sem_id
             WHERE t.id = ?`,
            [studentId, testId]
        );

        if (testRows.length === 0) {
            return sendError(res, 'Test not found', 404);
        }

        const test = testRows[0];

        const [answers] = await db.query(
            `SELECT question_id, slno, question, option_a, option_b, option_c, option_d,
                    submitted_answer, correct_ans, mark_obtained
             FROM student_assesment_test_answer
             WHERE test_id = ? AND student_id = ?
             ORDER BY CAST(slno AS UNSIGNED)`,
            [testId, studentId]
        );

        if (answers.length === 0) {
            return sendError(res, 'You have not submitted this test', 404);
        }

        let score = 0;
        let correct = 0;

        answers.forEach(a => {
            score += Number(a.mark_obtained) || 0;
            if (Number(a.mark_obtained) > 0) correct++;
        });

        return sendSuccess(res, {
            test_id: test.id,
            test_name: test.test_name,
            total_questions: answers.length,
            correct,
            score,
            questions: answers.map(a => ({
                sl_no: Number(a.slno),
                id: Number(a.question_id),
                question: a.question,
                options: [a.option_a, a.option_b, a.option_c, a.option_d],
                your_answer: a.submitted_answer,
                // correct answer is shown only after the test time is over
                correct_answer: test.has_ended ? a.correct_ans : null,
                mark_obtained: Number(a.mark_obtained) || 0
            }))
        }, 'Test result fetched successfully');

    } catch (err) {
        logger.error(`[McqTest] getMcqTestResult error: ${err.message}`);
        return sendError(res, 'Failed to fetch test result', 500);
    }
}

module.exports = {
    getQuestionBank,
    getQuestionsSubjectWise,
    getMcqTests,
    startMcqTest,
    submitMcqTest,
    getMcqTestResult
};
