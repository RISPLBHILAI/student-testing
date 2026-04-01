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

module.exports = { getQuestionBank, getQuestionsSubjectWise };