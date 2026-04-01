const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

const formatPhpDate = () => {
    const d = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    const day = pad(d.getDate());
    const month = pad(d.getMonth() + 1);
    const year = d.getFullYear();
    let hours = d.getHours() % 12 || 12;
    hours = pad(hours);
    const minutes = pad(d.getMinutes());
    const ampm = d.getHours() >= 12 ? 'pm' : 'am';
    return `${day}/${month}/${year} ${hours}:${minutes} ${ampm}`;
};

async function searchBooks(req, res) {
    try {
        const { searched } = req.body;
        const studentId = req.user.user_id;

        if (!searched || searched.trim() === '') {
            return sendError(res, 'Search string cannot be empty', 400);
        }

        logger.info(`[Library] Searching books for student: ${studentId}, query: "${searched}"`);

        const [studentRows] = await db.query(
            `SELECT clg_id FROM stud_current_sem_year WHERE stud_id = ?`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const { clg_id } = studentRows[0];

        const [books] = await db.query(
            `SELECT * FROM accession_detail
             WHERE clg_id = ? AND book_status <> '1'
               AND (title LIKE ? OR author LIKE ?)
             GROUP BY book_id
             LIMIT 20`,
            [clg_id, `%${searched}%`, `%${searched}%`]
        );

        const formattedBooks = books.map((book, index) => ({
            serial: index + 1,
            book_id: book.book_id,
            title: book.title || '-',
            author: book.author || '-',
            edition: book.edition || '-',
        }));

        logger.info(`[Library] Found ${formattedBooks.length} books for query: "${searched}"`);

        return sendSuccess(res, {
            studentId,
            search: searched.trim(),
            books: formattedBooks
        }, 'Books fetched successfully');

    } catch (err) {
        logger.error(`[Library] searchBooks error: ${err.message}`);
        return sendError(res, 'Failed to search books', 500);
    }
}

async function requestBook(req, res) {
    try {
        const { bookArray } = req.body;
        const studentId = req.user.user_id;

        if (!Array.isArray(bookArray) || bookArray.length < 5) {
            return sendError(res, 'Invalid book data', 400);
        }

        logger.info(`[Library] Book request by student: ${studentId}, book_id: ${bookArray[0]}`);

        const [studentRows] = await db.query(
            `SELECT clg_id, cor_id, branch_id, sem_year_id AS sem_id
             FROM stud_current_sem_year WHERE stud_id = ?`,
            [studentId]
        );

        if (studentRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const student = studentRows[0];
        const [book_id, book_title_raw, author_name_raw, book_edition, book_volume] = bookArray;
        const book_title = book_title_raw?.trim() || '-';
        const author_name = author_name_raw?.trim() || '-';
        const now = formatPhpDate();

        const [[bankIssue]] = await db.query(
            `SELECT * FROM book_bank_issue WHERE is_return='1' AND student_id=? AND book_id=?`,
            [studentId, book_id]
        );

        const [[issueMaster]] = await db.query(
            `SELECT * FROM book_issue_master WHERE book_issue_status='1' AND student_id=? AND book_id=?`,
            [studentId, book_id]
        );

        if (bankIssue || issueMaster) {
            return sendError(res, 'Book not yet returned', 400);
        }

        const [pendingRequests] = await db.query(
            `SELECT * FROM book_request WHERE stud_id=? AND book_id=? AND request_status='0'`,
            [studentId, book_id]
        );

        if (pendingRequests.length > 0) {
            return sendError(res, 'Book already requested and pending', 400);
        }

        await db.query(
            `INSERT INTO book_request
             (stud_id, clg_id, cor_id, branch_id, sem_id, book_id, request_status, book_title, book_author, book_volume, book_edition, created_by, created_on, updated_by, updated_on)
             VALUES (?, ?, ?, ?, ?, ?, '0', ?, ?, ?, ?, ?, ?, '', '')`,
            [studentId, student.clg_id, student.cor_id, student.branch_id, student.sem_id, book_id, book_title, author_name, book_volume, book_edition, studentId, now]
        );

        await db.query(
            `INSERT INTO book_request_log
             (stud_id, clg_id, cor_id, branch_id, sem_id, book_id, request_status, book_title, book_author, book_volume, book_edition, created_by, created_on, updated_by, updated_on)
             VALUES (?, ?, ?, ?, ?, ?, '0', ?, ?, ?, ?, ?, ?, '', '')`,
            [studentId, student.clg_id, student.cor_id, student.branch_id, student.sem_id, book_id, book_title, author_name, book_volume, book_edition, studentId, now]
        );

        logger.info(`[Library] Book request created for student: ${studentId}, book_id: ${book_id}`);

        return sendSuccess(res, { studentId, book_id }, 'Book request created successfully');

    } catch (err) {
        logger.error(`[Library] requestBook error: ${err.message}`);
        return sendError(res, 'Failed to request book', 500);
    }
}

async function getRequestedBooks(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Library] Fetching requested books for student: ${studentId}`);

        const [rows] = await db.query(
            `SELECT
                br.id AS req_id,
                sp.stud_name,
                sp.id AS stud_id,
                c.short_name,
                c.id AS clg_id,
                co.cor_name,
                co.id AS cor_id,
                bs.branch_sub_name,
                bs.id AS branch_id,
                br.book_id,
                br.sem_id,
                br.book_title,
                br.book_author,
                br.book_volume,
                br.book_edition,
                br.created_on,
                br.request_status
             FROM book_request br
             LEFT JOIN tblstud_profile sp ON sp.id = br.stud_id
             LEFT JOIN tblcollege c ON c.id = br.clg_id
             LEFT JOIN tblcourse co ON co.id = br.cor_id
             LEFT JOIN tblbranch_subject bs ON bs.id = br.branch_id
             WHERE br.stud_id = ?`,
            [studentId]
        );

        logger.info(`[Library] Found ${rows.length} requested books for student: ${studentId}`);

        return sendSuccess(res, { studentId, books: rows }, 'Requested books fetched successfully');

    } catch (err) {
        logger.error(`[Library] getRequestedBooks error: ${err.message}`);
        return sendError(res, 'Failed to fetch requested books', 500);
    }
}

async function getStudentBooks(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Library] Fetching issued books for student: ${studentId}`);

        const [clgIdRows] = await db.query(
            `SELECT clg_id FROM stud_current_sem_year WHERE stud_id = ?`,
            [studentId]
        );

        if (clgIdRows.length === 0) {
            return sendError(res, 'Student not found', 404);
        }

        const clgId = clgIdRows[0].clg_id;

        const [regularBooks] = await db.query(
            `SELECT
                bm.from_date,
                bm.b_id AS book_issue_id,
                bm.to_date,
                bm.return_date,
                bm.book_title,
                bm.accession_no,
                bm.book_id,
                bm.clg_id,
                c.cor_name,
                b.branch_sub_name,
                s.sem_year_name,
                sp.stud_name,
                bm.clg_name,
                bm.sem_id,
                bm.fine_paid_status,
                bm.book_issue_status AS returned
             FROM book_issue_master bm
             JOIN tblcourse c ON c.id = bm.course_id
             JOIN tblbranch_subject b ON b.id = bm.branch_id
             JOIN tbsem_year s ON s.id = bm.sem_id
             JOIN tblstud_profile sp ON sp.id = bm.student_id
             WHERE bm.student_id = ? AND bm.clg_id = ?
               AND (bm.fine_paid_status = '0' OR bm.fine_paid_status = '1')
             ORDER BY bm.sem_id DESC`,
            [studentId, clgId]
        );

        const [bankBooks] = await db.query(
            `SELECT
                issue_date AS from_date,
                return_date AS to_date,
                bb_issue_id AS book_issue_id,
                return_date2 AS return_date,
                book_title,
                book_id,
                bb.clg_id,
                accession_no,
                sp.stud_name,
                c.cor_name,
                b.branch_sub_name,
                s.sem_year_name,
                bb.clg_name,
                bb.sem_id,
                bb.fine_paid_status,
                is_return AS returned
             FROM book_bank_issue bb
             JOIN tblstud_profile sp ON sp.id = bb.student_id
             JOIN tblcourse c ON c.id = bb.course_id
             JOIN tblbranch_subject b ON b.id = bb.branch_id
             JOIN tbsem_year s ON s.id = bb.sem_id
             WHERE bb.student_id = ? AND bb.clg_id = ?
               AND (bb.fine_paid_status = '0' OR bb.fine_paid_status = '1')
             ORDER BY bb.sem_id DESC`,
            [studentId, clgId]
        );

        const books = [
            ...regularBooks.map(b => ({ ...b, book_type: 'rg' })),
            ...bankBooks.map(b => ({ ...b, book_type: 'bb' }))
        ];

        logger.info(`[Library] Found ${books.length} issued books for student: ${studentId}`);

        return sendSuccess(res, { studentId, books }, 'Student books fetched successfully');

    } catch (err) {
        logger.error(`[Library] getStudentBooks error: ${err.message}`);
        return sendError(res, 'Failed to fetch student books', 500);
    }
}

module.exports = { searchBooks, requestBook, getRequestedBooks, getStudentBooks };