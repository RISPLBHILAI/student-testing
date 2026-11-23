const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

const NOTES_BASE_URL = 'https://myrungta.com/erp/adminpanel/notes/';

// Session-wide notes folders per college, keyed by clg_id.
//   odd  → ODD (current) semester notes, 2026-27 session
//   even → EVEN semester notes, 2025-26 session
// An empty string means "no link yet" — the app gets '' for that college.
// comingSoon: true → the college has no notes; the app shows a Coming Soon popup.
const COLLEGE_DRIVE_LINKS = {
    2: {
        name: 'RSRRCET',
        odd:  'https://drive.google.com/drive/folders/1hsQ4ipvvZ5d_VnkcaAAPUACeRoVCgSDo?usp=drive_link',
        even: 'https://drive.google.com/drive/folders/1qSjmO433EPOT4BXJurSiIOW76A8KPWzK?usp=drive_link',
    },
    3: {
        name: 'RIPS',
        odd:  '',
        even: '',
    },
    4: {
        name: 'RIPSAR',
        odd:  '',
        even: '',
    },
    5: {
        name: 'RCST',
        odd:  'https://drive.google.com/drive/folders/1qZqlG_Gta5E1ahvBZo6QxqkAqgOo0Ibd?usp=drive_link',
        even: 'https://drive.google.com/drive/folders/1vVmVN0PAb8hrEcGswAJgWhJ_c-m7dK67?usp=drive_link',
    },
    6: {
        name: 'RISM',
        odd:  'https://drive.google.com/drive/folders/1qZqlG_Gta5E1ahvBZo6QxqkAqgOo0Ibd?usp=drive_link',
        even: 'https://drive.google.com/drive/folders/1vVmVN0PAb8hrEcGswAJgWhJ_c-m7dK67?usp=drive_link',
    },
    7: {
        name: 'Dental',
        odd:  '',
        even: '',
    },
    8: {
        name: 'ITI',
        comingSoon: true,
        odd:  '',
        even: '',
    },
    10: {
        name: 'RPS',
        comingSoon: true,
        odd:  '',
        even: '',
    },
};

function getSessionDriveLinks(clgId) {
    const links = COLLEGE_DRIVE_LINKS[Number(clgId)] || {};
    const odd  = links.odd  || '';
    const even = links.even || '';
    return {
        odd,
        even,
        // Explicitly marked, or no link at all for this college
        comingSoon: !!links.comingSoon || (!odd && !even),
    };
}

async function getStudentAcademics(studentId) {
    const [rows] = await db.query(
        `SELECT
            clg_id,
            cor_id,
            branch_id,
            sem_year_id AS sem_id
         FROM stud_current_sem_year
         WHERE stud_id = ?`,
        [studentId]
    );
    return rows[0] || null;
}

function formatNote(note) {
    // Older code read the file from either `file_name` or `notes_file`; support both.
    const fileName = note.file_name || note.notes_file || null;

    return {
        noteId: note.id,
        title: note.note_title || note.unitName,
        unitName: note.unitName,
        fileName,
        fileUrl: fileName ? `${NOTES_BASE_URL}${fileName}` : null,
        driveLink: note.google_drive_link || null,
        facultyName: note.facultyName,
        uploadedAt: note.created_at || note.upload_date,
        description: note.description || ''
    };
}

async function notes(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Notes] Fetching notes for student: ${studentId}`);

        const student = await getStudentAcademics(studentId);

        if (!student) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_id } = student;

        const [driveResult, notesResult] = await Promise.allSettled([
            // Drive link (unchanged from the existing behaviour)
            db.query(
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
            ),
            // All notes for the student's class, grouped by subject below
            db.query(
                `SELECT
                    unitwisenotes.*,
                    tblcollege.short_name AS collegeName,
                    tblcourse.cor_name AS courseName,
                    tblbranch_subject.branch_sub_name AS branchName,
                    employee_master.emp_name AS facultyName,
                    subject_allotment.subject_name AS subjectName,
                    unitwisenotes.unit_name AS unitName
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
                   AND COALESCE(unitwisenotes.delete_status, 0) != 1
                 ORDER BY subject_allotment.subject_name, unitwisenotes.unit_name, unitwisenotes.id DESC`,
                [clg_id, cor_id, branch_id, sem_id]
            )
        ]);

        // Drive link is the original contract — still fail the request if it errors.
        if (driveResult.status === 'rejected') {
            throw driveResult.reason;
        }
        const [driveRows] = driveResult.value;

        // The notes list is additive — if it fails, log and return an empty list
        // so the existing drive_link response keeps working.
        let noteRows = [];
        if (notesResult.status === 'fulfilled') {
            [noteRows] = notesResult.value;
        } else {
            logger.error(`[Notes] notes list query failed: ${notesResult.reason?.message}`);
        }

        const driveLink =
            driveRows.length > 0 && driveRows[0].google_drive_link
                ? driveRows[0].google_drive_link
                : '';

        const subjectsMap = new Map();
        for (const note of noteRows) {
            if (!subjectsMap.has(note.subject_id)) {
                subjectsMap.set(note.subject_id, {
                    subjectId: note.subject_id,
                    subjectName: note.subjectName,
                    notes: []
                });
            }
            subjectsMap.get(note.subject_id).notes.push(formatNote(note));
        }

        const first = noteRows[0];
        const sessionLinks = getSessionDriveLinks(clg_id);

        logger.info(
            `[Notes] Drive link ${driveLink ? 'found' : 'not found'}, ${noteRows.length} notes for student: ${studentId}`
        );

        return sendSuccess(
            res,
            {
                drive_link: driveLink,
                odd_session_drive_link: sessionLinks.odd,
                even_session_drive_link: sessionLinks.even,
                notes_coming_soon: sessionLinks.comingSoon,
                student: {
                    collegeName: first?.collegeName || '',
                    courseName: first?.courseName || '',
                    branchName: first?.branchName || ''
                },
                subjects: Array.from(subjectsMap.values()),
                totalNotes: noteRows.length
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

        const student = await getStudentAcademics(studentId);

        if (!student) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_id } = student;

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
               AND COALESCE(unitwisenotes.delete_status, 0) != 1
             ORDER BY unitwisenotes.unit_name, unitwisenotes.id DESC`,
            [clg_id, cor_id, branch_id, sem_id, subjectId]
        );

        const formattedNotes = notes.map(formatNote);

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
