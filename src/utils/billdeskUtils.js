const PAYMENT_TYPE_CODES = {
    1: 'ACA',
    2: 'HOS',
    3: 'TRA',
    4: 'RPS',
    5: 'LIB',
    6: 'BREAKFAST',
    7: 'GYM'
};

const getBDTimestamp = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    return `${year}${month}${day}${hours}${minutes}${seconds}`;
};

const generateBDTraceId = () => {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    // Random 4 digits instead of seconds (ensures uniqueness)
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

    return `${year}${month}${day}${hours}${minutes}${random}`;
    // Output: "20250108143052347" (14 digits)
};

const generateBDTraceIdNew = () => {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    // Random 4 digits instead of seconds (ensures uniqueness)
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

    return `${year}${month}${day}${hours}${minutes}${random}`;
    // Output: "20250108143052347" (14 digits)
};

const generateOrderId = (collegeName, paymentType, studentId) => {
    const typeCode = PAYMENT_TYPE_CODES[paymentType];

    if (!typeCode) {
        throw new Error(`Invalid payment type: ${paymentType}`);
    }

    const randomNum = Math.floor(Math.random() * (1000000000 - 99999) + 99999);

    return `${collegeName}${typeCode}${studentId}${randomNum}`;
};

const generateCustomerRefId = (firstName, studRollNo) => {
    const prefix = firstName.toUpperCase();
    const randomNum = Math.floor(Math.random() * (9000 - 1000) + 1000); // 4-digit random
    const last4 = String(studRollNo).slice(-4);

    return `${prefix}${randomNum}${last4}`;
};

const getClientIp = (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.ip ||
        '0.0.0.0';
};

module.exports = {
    getBDTimestamp,
    generateBDTraceId,
    generateBDTraceIdNew,
    generateOrderId,
    generateCustomerRefId,
    getClientIp,
    PAYMENT_TYPE_CODES
};