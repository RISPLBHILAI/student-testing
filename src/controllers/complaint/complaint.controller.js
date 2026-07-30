const db = require("../../../../shared/db/mysql");
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");

// Generate unique complaint ID
const generateComplaintID = () => {
    const prefix = "CMP";
    const now = new Date();
    const dateTime = now.getFullYear().toString() +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0') +
        String(now.getHours()).padStart(2, '0') +
        String(now.getMinutes()).padStart(2, '0') +
        String(now.getSeconds()).padStart(2, '0');
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${prefix}-${dateTime}-${random}`;
};

// Get current datetime in MySQL format
const getCurrentDateTime = () => {
    const now = new Date();
    return now.toISOString().slice(0, 19).replace('T', ' ');
};

const fetchDepartmentName = async (departmentId) => {
    if (!departmentId) return '-';
    const [deptRows] = await db.query(
        `SELECT department_name FROM department_master
         WHERE dep_id = ? AND enable_status = '1' LIMIT 1`,
        [departmentId]
    );
    return deptRows.length > 0 ? deptRows[0].department_name.toUpperCase().trim() : '-';
};

const formatComplaint = (complaint, departmentName) => ({
    id: complaint.id,
    complaint_id: complaint.complaint_id,
    title: complaint.complaint_title || '',
    description: complaint.complaint_description,
    category: complaint.complaint_category,
    status: complaint.status,
    priority: complaint.priority || '',
    resolver_department: departmentName,
    resolution_remarks: complaint.resolution_remarks || null,
    can_delete: complaint.status === 'Pending',
    created_at: complaint.created_at,
});

async function createComplaint(req, res) {
    try {
        const studentId = req.user.user_id;
        const { complaint_description, complaint_category } = req.body;

        logger.info(`[Complaint] Creating complaint for student: ${studentId}`);

        if (!complaint_description || !complaint_description.trim()) {
            return sendError(res, 'Complaint description is required', 400);
        }

        if (!complaint_category || !complaint_category.trim()) {
            return sendError(res, 'Complaint category is required', 400);
        }

        if (complaint_description.trim().length < 20) {
            return sendError(res, 'Description must be at least 20 characters long', 400);
        }

        if (complaint_description.trim().length > 1000) {
            return sendError(res, 'Description cannot exceed 1000 characters', 400);
        }

        const complaintId = generateComplaintID();
        const dateTime = getCurrentDateTime();

        const [result] = await db.query(
            `INSERT INTO scp_student_complaint_file
             (complaint_id, complaint_title, complaint_description, complaint_category, status, priority, created_at, created_by, active_status)
             VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, 1)`,
            [complaintId, '', complaint_description.trim(), complaint_category.trim(), '', dateTime, studentId]
        );

        logger.info(`[Complaint] Complaint created for student: ${studentId}, complaint_id: ${complaintId}`);

        return sendSuccess(res, {
            id: result.insertId,
            complaint_id: complaintId
        }, 'Complaint has been submitted successfully');

    } catch (err) {
        logger.error(`[Complaint] createComplaint error: ${err.message}`);
        return sendError(res, 'Unable to submit complaint. Please try again.', 500);
    }
}

async function getComplaints(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Complaint] Fetching complaints for student: ${studentId}`);

        const [complaints] = await db.query(
            `SELECT 
                id, 
                complaint_id, 
                complaint_title, 
                complaint_description, 
                complaint_category, 
                resolver_department_id, 
                status, 
                priority,
                created_at,
                updated_at
            FROM scp_student_complaint_file 
            WHERE active_status = 1 AND created_by = ?
            ORDER BY id DESC`,
            [studentId]
        );

        const formattedComplaints = await Promise.all(
            complaints.map(async (complaint) => {
                const departmentName = await fetchDepartmentName(complaint.resolver_department_id);
                return formatComplaint(complaint, departmentName);
            })
        );

        logger.info(`[Complaint] Found ${formattedComplaints.length} complaints for student: ${studentId}`);

        return sendSuccess(res, {
            complaints: formattedComplaints,
            count: formattedComplaints.length
        }, 'Complaints fetched successfully');

    } catch (err) {
        logger.error(`[Complaint] getComplaints error: ${err.message}`);
        return sendError(res, 'Unable to fetch complaints. Please try again.', 500);
    }
}

async function getComplaintDetails(req, res) {
    try {
        const studentId = req.user.user_id;
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return sendError(res, 'Invalid complaint ID', 400);
        }

        logger.info(`[Complaint] Fetching complaint details. ID: ${id}, student: ${studentId}`);

        const [complaints] = await db.query(
            `SELECT
                id, complaint_id, complaint_title, complaint_description,
                complaint_category, resolver_department_id, status, priority,
                created_at, resolution_remarks
             FROM scp_student_complaint_file
             WHERE id = ? AND created_by = ? AND active_status = 1`,
            [parseInt(id), studentId]
        );

        if (complaints.length === 0) {
            return sendError(res, 'Complaint not found', 404);
        }

        const complaint = complaints[0];
        const departmentName = await fetchDepartmentName(complaint.resolver_department_id);

        return sendSuccess(res, formatComplaint(complaint, departmentName), 'Complaint details fetched successfully');

    } catch (err) {
        logger.error(`[Complaint] getComplaintDetails error: ${err.message}`);
        return sendError(res, 'Unable to fetch complaint details. Please try again.', 500);
    }
}

async function deleteComplaint(req, res) {
    try {
        const studentId = req.user.user_id;
        const { id } = req.params;

        if (!id || isNaN(id)) {
            return sendError(res, 'Invalid complaint ID', 400);
        }

        logger.info(`[Complaint] Deleting complaint. ID: ${id}, student: ${studentId}`);

        const [checkRows] = await db.query(
            `SELECT id, status FROM scp_student_complaint_file
             WHERE id = ? AND created_by = ? AND active_status = 1`,
            [parseInt(id), studentId]
        );

        if (checkRows.length === 0) {
            return sendError(res, 'Complaint not found', 404);
        }

        if (checkRows[0].status !== 'Pending') {
            return sendError(res, 'Only pending complaints can be deleted', 400);
        }

        const dateTime = getCurrentDateTime();

        await db.query(
            `UPDATE scp_student_complaint_file
             SET active_status = 0, deleted_at = ?, deleted_by = ?
             WHERE id = ?`,
            [dateTime, studentId, parseInt(id)]
        );

        logger.info(`[Complaint] Complaint deleted. ID: ${id}, student: ${studentId}`);

        return sendSuccess(res, { id: parseInt(id) }, 'Complaint has been deleted successfully');

    } catch (err) {
        logger.error(`[Complaint] deleteComplaint error: ${err.message}`);
        return sendError(res, 'Failed to delete complaint. Please try again.', 500);
    }
}

async function getCategories(req, res) {
    try {
        logger.info(`[Complaint] Fetching complaint categories`);

        try {
            const [categories] = await db.query(
                `SELECT id, category_name FROM scp_complaint_categories
                 WHERE active_status = 1 ORDER BY category_name ASC`
            );

            if (categories.length > 0) {
                return sendSuccess(res, { categories }, 'Categories fetched successfully');
            }
        } catch (dbError) {
            logger.warn(`[Complaint] Categories table not found, using defaults`);
        }

        const defaultCategories = [
            { id: 1, category_name: 'Academic' },
            { id: 2, category_name: 'Infrastructure' },
            { id: 3, category_name: 'Hostel' },
            { id: 4, category_name: 'Transport' },
            { id: 5, category_name: 'Library' },
            { id: 6, category_name: 'Fees' },
            { id: 7, category_name: 'Other' }
        ];

        return sendSuccess(res, { categories: defaultCategories }, 'Categories fetched successfully');

    } catch (err) {
        logger.error(`[Complaint] getCategories error: ${err.message}`);
        return sendError(res, 'Unable to fetch categories. Please try again.', 500);
    }
}

async function getStats(req, res) {
    try {
        const studentId = req.user.user_id;

        logger.info(`[Complaint] Fetching stats for student: ${studentId}`);

        const [statsRows] = await db.query(
            `SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'InProgress' THEN 1 ELSE 0 END) as inProgress,
                SUM(CASE WHEN status = 'Resolved' THEN 1 ELSE 0 END) as resolved
             FROM scp_student_complaint_file
             WHERE active_status = 1 AND created_by = ?`,
            [studentId]
        );

        const stats = statsRows[0];

        return sendSuccess(res, {
            total: parseInt(stats.total) || 0,
            pending: parseInt(stats.pending) || 0,
            inProgress: parseInt(stats.inProgress) || 0,
            resolved: parseInt(stats.resolved) || 0
        }, 'Statistics fetched successfully');

    } catch (err) {
        logger.error(`[Complaint] getStats error: ${err.message}`);
        return sendError(res, 'Unable to fetch statistics. Please try again.', 500);
    }
}

module.exports = {
    createComplaint,
    getComplaints,
    getComplaintDetails,
    deleteComplaint,
    getCategories,
    getStats
};