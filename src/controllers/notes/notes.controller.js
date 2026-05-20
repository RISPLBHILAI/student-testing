const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

const NOTES_BASE_URL = 'https://myrungta.com/erp/adminpanel/notes/';

async function notes(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Notes] Fetching notes for student: ${studentId}`);

        // Get student academic details
        const [studentRows] = await db.query(
            `SELECT 
                clg_id, 
                cor_id, 
                branch_id, 
                sem_year_id AS sem_id
             FROM stud_current_sem_year
             WHERE stud_id = ?`,
            [studentId]
        );

        if (!studentRows.length) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_id } = studentRows[0];

        // Fetch drive link
        const [notes] = await db.query(
            `SELECT google_drive_link
             FROM unitwisenotes
             WHERE clg_id = ?
               AND cor_id = ?
               AND branch_id = ?
               AND sem_id = ?
               AND notes_type = 1
               AND delete_status != 1
             LIMIT 1`,
            [clg_id, cor_id, branch_id, sem_id]
        );

        const driveLink =
            notes.length > 0 && notes[0].google_drive_link
                ? notes[0].google_drive_link
                : '';

        logger.info(
            `[Notes] Drive link ${driveLink ? 'found' : 'not found'} for student: ${studentId}`
        );

        return sendSuccess(
            res,
            {
                drive_link: driveLink
            },
            'Notes fetched successfully'
        );

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