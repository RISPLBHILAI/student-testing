const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

const NOTES_BASE_URL = process.env.NOTES_BASE_URL;

async function notes(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Notes] Fetching all notes for student: ${studentId}`);

        const [studentRows] = await db.query(
            `SELECT clg_id, cor_id, branch_id, sem_year_id AS sem_id 
             FROM stud_current_sem_year WHERE stud_id = ?`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_id } = studentRows[0];

        const [notes] = await db.query(
            `SELECT
                unitwisenotes.*,
                tblcollege.short_name as collegeName,
                tblcourse.cor_name as courseName,
                tblbranch_subject.branch_sub_name as branchName,
                employee_master.emp_name as facultyName,
                subject_allotment.subject_name as subjectName,
                unitwisenotes.unit_name as unitName
             FROM unitwisenotes
             INNER JOIN tblcollege ON tblcollege.id = unitwisenotes.clg_id
             INNER JOIN tblcourse ON tblcourse.id = unitwisenotes.cor_id
             INNER JOIN tblbranch_subject ON tblbranch_subject.id = unitwisenotes.branch_id
             INNER JOIN employee_master ON employee_master.emp_id = unitwisenotes.faculty_id
             INNER JOIN subject_to_unit ON subject_to_unit.id = unitwisenotes.unit_id
             INNER JOIN subject_allotment ON subject_allotment.id = unitwisenotes.subject_id
             WHERE unitwisenotes.clg_id = ?
               AND unitwisenotes.cor_id = ?
               AND unitwisenotes.branch_id = ?
               AND unitwisenotes.sem_id = ?
             ORDER BY subject_allotment.subject_name, unitwisenotes.unit_name, unitwisenotes.id DESC`,
            [clg_id, cor_id, branch_id, sem_id]
        );

        const subjectsMap = {};

        notes.forEach(note => {
            const subjectId = note.subject_id;

            if (!subjectsMap[subjectId]) {
                subjectsMap[subjectId] = {
                    subjectId,
                    subjectName: note.subjectName,
                    notes: []
                };
            }

            subjectsMap[subjectId].notes.push({
                noteId: note.id,
                title: note.note_title || note.unitName,
                unitName: note.unitName,
                fileName: note.file_name,
                fileUrl: note.file_name ? `${NOTES_BASE_URL}${note.file_name}` : null,
                facultyName: note.facultyName,
                uploadedAt: note.created_at || note.upload_date,
                description: note.description || ''
            });
        });

        const subjects = Object.values(subjectsMap);

        logger.info(`[Notes] Found ${notes.length} notes across ${subjects.length} subjects for student: ${studentId}`);

        return sendSuccess(res, {
            student: {
                collegeName: notes[0]?.collegeName || '',
                courseName: notes[0]?.courseName || '',
                branchName: notes[0]?.branchName || ''
            },
            subjects,
            totalNotes: notes.length
        }, 'Notes fetched successfully');

    } catch (err) {
        logger.error(`[Notes] getNotes error: ${err.message}`);
        return sendError(res, 'Failed to fetch notes', 500);
    }
}

async function notesBySubject(req, res) {
    try {
        const studentId = req.user.user_id;
        const { subjectId } = req.params;

        logger.info(`[Notes] Fetching notes for student: ${studentId}, subject: ${subjectId}`);

        const [studentRows] = await db.query(
            `SELECT clg_id, cor_id, branch_id, sem_year_id AS sem_id 
             FROM stud_current_sem_year WHERE stud_id = ?`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_id } = studentRows[0];

        const [notes] = await db.query(
            `SELECT
                unitwisenotes.*,
                employee_master.emp_name as facultyName,
                subject_allotment.subject_name as subjectName,
                unitwisenotes.unit_name as unitName
             FROM unitwisenotes
             INNER JOIN employee_master ON employee_master.emp_id = unitwisenotes.faculty_id
             INNER JOIN subject_to_unit ON subject_to_unit.id = unitwisenotes.unit_id
             INNER JOIN subject_allotment ON subject_allotment.id = unitwisenotes.subject_id
             WHERE unitwisenotes.clg_id = ?
               AND unitwisenotes.cor_id = ?
               AND unitwisenotes.branch_id = ?
               AND unitwisenotes.sem_id = ?
               AND unitwisenotes.subject_id = ?
             ORDER BY unitwisenotes.unit_name, unitwisenotes.id DESC`,
            [clg_id, cor_id, branch_id, sem_id, subjectId]
        );

        const formattedNotes = notes.map(note => ({
            noteId: note.id,
            title: note.note_title || note.unitName,
            unitName: note.unitName,
            fileName: note.file_name,
            fileUrl: note.file_name ? `${NOTES_BASE_URL}${note.file_name}` : null,
            facultyName: note.facultyName,
            uploadedAt: note.created_at || note.upload_date,
            description: note.description || ''
        }));

        logger.info(`[Notes] Found ${formattedNotes.length} notes for subject: ${subjectId}`);

        return sendSuccess(res, {
            subjectId,
            subjectName: notes[0]?.subjectName || '',
            notes: formattedNotes
        }, 'Notes fetched successfully');

    } catch (err) {
        logger.error(`[Notes] getNotesBySubject error: ${err.message}`);
        return sendError(res, 'Failed to fetch notes', 500);
    }
}

module.exports = { notes, notesBySubject };