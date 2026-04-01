const axios = require('axios');
const logger = require("../../../../shared/utils/logger");
const { sendSuccess, sendError } = require("../../../../shared/utils/response");
const PaymentModel = require('../../models/paymentModel');
const { getBDTimestamp, generateBDTraceId, generateBDTraceIdNew, generateOrderId, generateCustomerRefId, getClientIp, PAYMENT_TYPE_CODES } = require('../../utils/billdeskUtils');
const { encryptAndSign, verifyAndDecrypt } = require('../../utils/joseUtils');

// ─── Merchant IDs ─────────────────────────────────────────────────────────────

const MERCHANT_ID = process.env.BILLDESK_MERCHANT_ID;

const COLLEGE_MERCHANT_IDS = {
    'RIPSR':   process.env.BILLDESK_CHILD_MERCHANT_RIPSR,
    'RIPS':    process.env.BILLDESK_CHILD_MERCHANT_RIPS,
    'RISM':    process.env.BILLDESK_CHILD_MERCHANT_RISM,
    'RCST':    process.env.BILLDESK_CHILD_MERCHANT_RCST,
    'RCDSR':   process.env.BILLDESK_CHILD_MERCHANT_RCDSR,
    'RSRRCET': process.env.BILLDESK_CHILD_MERCHANT_RSRRCET,
    'RPITI':   process.env.BILLDESK_CHILD_MERCHANT_RPITI,
};

const SCHOOL_MERCHANT_IDS = {
    'RPS': process.env.BILLDESK_CHILD_MERCHANT_RPS,
};

const MERCHANT_ID_HOS = process.env.BILLDESK_CHILD_MERCHANT_HOS;
const MERCHANT_ID_TRA = process.env.BILLDESK_CHILD_MERCHANT_TRA;

const BILLDESK_BASE_URL = process.env.BILLDESK_BASE_URL;
const PHP_API_URL       = process.env.PHP_API_URL;

const config = {
    encryptionKey:   process.env.BILLDESK_ENCRYPTION_KEY,
    encryptionKeyId: process.env.BILLDESK_ENCRYPTION_KEY_ID,
    signingKey:      process.env.BILLDESK_SIGNING_KEY,
    signingKeyId:    process.env.BILLDESK_SIGNING_KEY_ID,
    clientId:        process.env.BILLDESK_CLIENT_ID
};

// ─── Helper: resolve child merchant by payment type + college ─────────────────

function getChildMerchantId(paymentType, collegeShortName) {
    const shortName = collegeShortName?.toUpperCase() || '';

    switch (paymentType) {
        case 1: // Academic
        case 5: // Library
            if (COLLEGE_MERCHANT_IDS[shortName]) {
                logger.info(`[Billdesk] Using COLLEGE merchant for ${shortName} (Type ${paymentType})`);
                return COLLEGE_MERCHANT_IDS[shortName];
            }
            logger.info(`[Billdesk] Using DEFAULT college merchant for ${shortName} (Type ${paymentType})`);
            return process.env.BILLDESK_CHILD_MERCHANT_CLG;

        case 4: // School
            if (SCHOOL_MERCHANT_IDS[shortName]) {
                logger.info(`[Billdesk] Using SCHOOL merchant for ${shortName} (Type ${paymentType})`);
                return SCHOOL_MERCHANT_IDS[shortName];
            }
            logger.info(`[Billdesk] Using DEFAULT school merchant for ${shortName} (Type ${paymentType})`);
            return process.env.BILLDESK_CHILD_MERCHANT_CLG;

        case 2: // Hostel
        case 7: // Gym
            logger.info(`[Billdesk] Using HOSTEL merchant (Type ${paymentType})`);
            return MERCHANT_ID_HOS;

        case 3: // Transport
            logger.info(`[Billdesk] Using TRANSPORT merchant (Type ${paymentType})`);
            return MERCHANT_ID_TRA;

        default:
            logger.info(`[Billdesk] Using DEFAULT college merchant (Unknown Type ${paymentType})`);
            return process.env.BILLDESK_CHILD_MERCHANT_CLG;
    }
}

// ─── Helper: error message from BillDesk status codes ────────────────────────

function getErrorMessage(authStatus, txnErrorType) {
    const errorMessages = {
        '0399': 'Payment Failed',
        '0002': 'Payment Pending',
        '0001': 'Payment Error',
        'NA':   'Transaction could not be processed'
    };

    const txnErrorMessages = {
        'INV': 'Invalid transaction',
        'TO':  'Transaction timeout',
        'F':   'Transaction failed',
        'D':   'Transaction declined'
    };

    return txnErrorMessages[txnErrorType] || errorMessages[authStatus] || 'Payment could not be completed';
}

// ─── PHP payment processors ───────────────────────────────────────────────────

async function processAcademicPayment({
    orderId, amount, studentId, fineDetails, feesDetails, semId, clientIp,
    installmentId = null, installmentNo = null, appliedInstId = null,
    payableAmount = null, fineDuration = 0, totalAmount = null,
    totalWithInterest = null, fineBeforeInstallment = 0
}) {
    const {
        fineAmt = 0, duration = 0, multiplier = 0,
        fineType = '', fineAppliedOn = '', totalFine = 0
    } = fineDetails || {};

    const { scholarshipAmt = 0, remainingDueDate = '' } = feesDetails || {};

    const payload = {
        orderId, amount, studentId, semId,
        isScholarship: Number(scholarshipAmt != 0),
        fineAmt, duration, multiplier, fineType, fineAppliedOn, totalFine,
        scholarshipAmt, remainingDueDate,
        ipAddress: clientIp,
        installment_id:          installmentId,
        installment_no:          installmentNo,
        applied_inst_id:         appliedInstId,
        payable_amount:          payableAmount,
        fine_duration:           fineDuration || duration,
        total_amount:            totalAmount,
        total_with_interest:     totalWithInterest,
        fine_before_installment: fineBeforeInstallment,
    };

    logger.info(`[Billdesk] Sending ${installmentId ? 'INSTALLMENT' : 'REGULAR'} academic payment to PHP`);

    return axios.post(`${PHP_API_URL}/academic_payment_begin.php`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
}

async function processHostelPayment({
    orderId, amount, studentId, hostelFees, hostelFine, fineApplicable,
    fineDays, finePerDay, remainingCurrent, totalCurrentPayable, currentPaidFees,
    instalmentOptStatus, allotmentLogId, studMobile, studEmail,
    selectedInstallmentIds = null, selectedInstallments = null, clientIp
}) {
    const payload = {
        hostel_oid:                    orderId,
        student_id:                    studentId,
        hostel_fees:                   hostelFees,
        hostel_fine:                   hostelFine,
        fine_days:                     fineDays,
        fine_per_day:                  finePerDay,
        remaningCurrent:               remainingCurrent, // Note: PHP typo preserved
        total_current_payable:         totalCurrentPayable || amount,
        current_paid_fees:             currentPaidFees,
        instalment_opt_status_hostel:  instalmentOptStatus,
        allotment_log_id:              allotmentLogId,
        stud_mobile_hos:               studMobile,
        stud_email_id_hos:             studEmail,
        ip_address:                    clientIp,
        selected_installment_ids:      selectedInstallmentIds,
        selected_installments:         selectedInstallments,
    };

    logger.info(`[Billdesk] Sending HOSTEL ${instalmentOptStatus === 1 ? 'INSTALLMENT' : 'FULL'} payment to PHP`);

    return axios.post(`${PHP_API_URL}/hostel_payment_begin.php`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
}

async function processTransportPayment({
    orderId, amount, studentId, transportFees, transportFine, fineDays,
    finePerDay, remainingCurrent, totalCurrentPayable, currentPaidFees,
    instalmentOptStatus, studMobile, studEmail,
    selectedInstallmentIds = null, selectedInstallments = null, clientIp
}) {
    const payload = {
        transport_oid:                      orderId,
        student_id:                         studentId,
        transport_fees:                     transportFees,
        transport_fine:                     transportFine,
        fine_days:                          fineDays,
        fine_per_day:                       finePerDay,
        remaningCurrent:                    remainingCurrent, // Note: PHP typo preserved
        total_current_payable:              totalCurrentPayable || amount,
        current_paid_fees:                  currentPaidFees,
        instalment_opt_status_transport:    instalmentOptStatus || 0,
        stud_mobile_trans:                  studMobile,
        stud_email_id_trans:                studEmail,
        ip_address:                         clientIp,
        selected_installment_ids:           selectedInstallmentIds,
        selected_installments:              selectedInstallments,
    };

    logger.info(`[Billdesk] Sending TRANSPORT ${instalmentOptStatus === 1 ? 'INSTALLMENT' : 'FULL'} payment to PHP`);

    return axios.post(`${PHP_API_URL}/transport_payment_begin.php`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
}

async function processLibraryPayment({ orderId, amount, studentId, fineAmt, semId, clientIp }) {
    const payload = {
        library_oid: orderId,
        student_id:  studentId,
        amount,
        library_fine: fineAmt,
        sem_id:       semId,
        ip_address:   clientIp
    };

    logger.info(`[Billdesk] Sending LIBRARY payment to PHP`);

    return axios.post(`${PHP_API_URL}/library_payment_begin.php`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
}

async function processGymPayment({ orderId, amount, studentId, subscriptionId, subscriptionType, subscriptionAmount, semId, clientIp }) {
    const payload = {
        order_id:            orderId,
        stud_id:             studentId,
        amount,
        subcription_id:      subscriptionId, // Note: PHP typo preserved
        subscription_type:   subscriptionType,
        subscription_amount: subscriptionAmount,
        sem_id:              semId,
        ip_address:          clientIp
    };

    logger.info(`[Billdesk] Sending GYM payment to PHP`);

    return axios.post(`${PHP_API_URL}/gym_transaction_begin.php`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
}

async function processSchoolPayment({ orderId, amount, studentId, fineDetails, feesDetails, semId, clientIp }) {
    const payload = {
        school_oid:   orderId,
        student_id:   studentId,
        amount,
        sem_id:       semId,
        ip_address:   clientIp,
        fine_details: fineDetails,
        fees_details: feesDetails
    };

    logger.info(`[Billdesk] Sending SCHOOL payment to PHP`);

    return axios.post(`${PHP_API_URL}/school_payment_begin.php`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
    });
}

// ─── Controllers ──────────────────────────────────────────────────────────────

async function createOrder(req, res) {
    try {
        const {
            amount, feesDetails, fineDetails, paymentType, device, fineAmt,
            semId = null,
            hostelFees, hostelFine, fineApplicable, fineDays, finePerDay,
            remainingCurrent, totalCurrentPayable, currentPaidFees,
            instalmentOptStatus, allotmentLogId, studMobile, studEmail,
            selectedInstallmentIds, selectedInstallments,
            transportFees, transportFine,
            subscriptionId, subscriptionType, subscriptionAmount,
            installment_id, installment_no, applied_inst_id, payable_amount,
            fine_duration, total_amount, total_with_interest, fine_before_installment,
            student_id: reqStudentId,
        } = req.body;

        const studentId = req.user.user_id || reqStudentId;

        if (!amount || !paymentType || !studentId) {
            return sendError(res, 'Amount, paymentType and studentId are required', 400);
        }

        if (!PAYMENT_TYPE_CODES[paymentType]) {
            return sendError(res, `Invalid payment type: ${paymentType}`, 400);
        }

        logger.info(`[Billdesk] createOrder for student: ${studentId}, type: ${paymentType} → ${PAYMENT_TYPE_CODES[paymentType]}${installment_id ? `, installment: ${installment_id}` : ''}`);

        const studentProfile = await PaymentModel.getStudentProfile(studentId);
        if (!studentProfile) {
            return sendError(res, 'Student not found', 404);
        }

        const { stud_name, stud_mobile, stud_email_id, stud_roll_no } = studentProfile;

        const currentSem = await PaymentModel.getStudentCurrentSem(studentId);
        if (!currentSem) {
            return sendError(res, 'Student semester details not found', 404);
        }

        const { clg_id, cor_id, branch_id, sem_year_id } = currentSem;

        const college = await PaymentModel.getCollegeDetails(clg_id);
        if (!college) {
            return sendError(res, 'College not found', 404);
        }

        const { short_name } = college;
        const clientIp      = getClientIp(req);
        const deviceInfo    = { ...device, ip: clientIp };

        const orderId = installment_id
            ? generateOrderId(short_name, paymentType, studentId) + 'I' + installment_id
            : generateOrderId(short_name, paymentType, studentId);

        const childMerchantId = getChildMerchantId(paymentType, short_name);
        logger.info(`[Billdesk] Child merchant: ${childMerchantId} for ${short_name} (type: ${paymentType})`);

        let phpResponse;

        switch (paymentType) {
            case 1: // Academic (regular or installment)
                phpResponse = await processAcademicPayment({
                    orderId, amount, studentId, fineDetails, feesDetails,
                    semId: semId || sem_year_id, clientIp,
                    installmentId: installment_id, installmentNo: installment_no,
                    appliedInstId: applied_inst_id, payableAmount: payable_amount,
                    fineDuration: fine_duration, totalAmount: total_amount,
                    totalWithInterest: total_with_interest,
                    fineBeforeInstallment: fine_before_installment,
                });
                break;

            case 2: // Hostel
                phpResponse = await processHostelPayment({
                    orderId, amount, studentId, hostelFees, hostelFine,
                    fineApplicable, fineDays, finePerDay, remainingCurrent,
                    totalCurrentPayable, currentPaidFees,
                    instalmentOptStatus: instalmentOptStatus || 0,
                    allotmentLogId,
                    studMobile: studMobile || stud_mobile,
                    studEmail:  studEmail  || stud_email_id,
                    selectedInstallmentIds, selectedInstallments, clientIp
                });
                break;

            case 3: // Transport
                phpResponse = await processTransportPayment({
                    orderId, amount, studentId,
                    transportFees: transportFees || amount,
                    transportFine: transportFine || 0,
                    fineDays: fineDays || 0, finePerDay: finePerDay || 0,
                    remainingCurrent: remainingCurrent || amount,
                    totalCurrentPayable: totalCurrentPayable || amount,
                    currentPaidFees: currentPaidFees || 0,
                    instalmentOptStatus: instalmentOptStatus || 0,
                    studMobile: studMobile || stud_mobile,
                    studEmail:  studEmail  || stud_email_id,
                    selectedInstallmentIds, selectedInstallments, clientIp
                });
                break;

            case 4: // School
                phpResponse = await processSchoolPayment({
                    orderId, amount, studentId, fineDetails, feesDetails, semId, clientIp
                });
                break;

            case 5: // Library
                phpResponse = await processLibraryPayment({
                    orderId, amount, studentId, fineAmt, semId, clientIp
                });
                break;

            case 7: // Gym
                phpResponse = await processGymPayment({
                    orderId, amount, studentId, subscriptionId,
                    subscriptionType, subscriptionAmount, semId, clientIp
                });
                break;

            default:
                return sendError(res, `Unsupported payment type: ${paymentType}`, 400);
        }

        logger.info(`[Billdesk] PHP response received for order: ${orderId}`);

        if (!phpResponse.data.success) {
            return sendError(res, phpResponse.data.message || 'Failed to create transaction records', 400);
        }

        const phpData     = phpResponse.data.data || phpResponse.data;
        const studName    = phpData.studName    || phpData.stud_name    || stud_name;
        const phpStudMobile = phpData.studMobile  || phpData.stud_mobile  || stud_mobile;
        const phpStudEmail  = phpData.studEmail   || phpData.stud_email   || phpData.stud_email_id || stud_email_id;
        const clgShortName  = phpData.clgShortName || phpData.clg_short_name || short_name;

        const orderDate = new Date().toLocaleString('sv-SE', {
            timeZone: 'Asia/Kolkata',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false
        }).replace(' ', 'T') + '+05:30';

        const bdTimestamp  = getBDTimestamp();
        const bdTraceId    = generateBDTraceId();
        const bdTraceIdNew = generateBDTraceIdNew();

        const customerName  = studName || stud_name;
        const nameParts     = customerName.trim().split(' ');
        const customer      = {
            first_name: nameParts[0],
            last_name:  nameParts.at(-1),
            mobile:     phpStudMobile || stud_mobile,
            email:      phpStudEmail  || stud_email_id,
        };

        const customer_refid = generateCustomerRefId(customer.first_name, stud_roll_no);

        const orderPayloadNew = {
            mercid:          MERCHANT_ID,
            amount,
            order_ref_no:    orderId,
            ecom_order_date: orderDate,
            ru:              'https://myrungta.com:4001/api/billdesk/payment-callback',
            currency:        '356',
            itemcode:        'DIRECT',
            customer,
            device:          deviceInfo,
            split_payment: [{
                mercid:           childMerchantId,
                amount,
                customer_refid,
                additional_info1: customerName,
                additional_info2: stud_roll_no,
                additional_info3: phpStudMobile || stud_mobile,
                additional_info4: phpStudEmail  || stud_email_id,
            }]
        };

        const encryptedPayloadNew = await encryptAndSign(orderPayloadNew, config);

        const responseNew = await axios.post(
            `${BILLDESK_BASE_URL}/ecomorders/create`,
            encryptedPayloadNew,
            {
                headers: {
                    'Content-Type': 'application/jose',
                    'Accept':       'application/jose',
                    'BD-Traceid':   bdTraceIdNew,
                    'BD-Timestamp': bdTimestamp
                }
            }
        );

        const decryptedResponseNew = await verifyAndDecrypt(responseNew.data, config);
        const TraceId = decryptedResponseNew.ecom_orderid;

        logger.info(`[Billdesk] ecom orderid (TraceId): ${TraceId}`);

        const updateTraceId = await axios.post(
            `${PHP_API_URL}/udpate_trace_id.php`,
            { traceId: TraceId, orderId },
            { headers: { 'Content-Type': 'application/json' }, timeout: 30000 }
        );

        if (updateTraceId.data.success === false) {
            logger.error(`[Billdesk] Failed to update TraceId in PHP for order: ${orderId}`);
            return sendError(res, 'Failed to update transaction trace ID', 400);
        }

        const orderPayload = {
            mercid:     MERCHANT_ID,
            orderid:    TraceId,
            amount,
            order_date: orderDate,
            currency:   '356',
            ru:         'https://myrungta.com:4001/api/billdesk/payment-callback',
            itemcode:   'DIRECT',
            device:     deviceInfo,
            additional_info: {
                additional_info1: customerName,
                additional_info2: stud_roll_no,
                additional_info3: phpStudMobile || stud_mobile,
                additional_info4: phpStudEmail  || stud_email_id,
            },
        };

        const encryptedPayload = await encryptAndSign(orderPayload, config);

        const response = await axios.post(
            `${BILLDESK_BASE_URL}/orders/create`,
            encryptedPayload,
            {
                headers: {
                    'Content-Type': 'application/jose',
                    'Accept':       'application/jose',
                    'BD-Traceid':   bdTraceId,
                    'BD-Timestamp': bdTimestamp
                }
            }
        );

        const decryptedResponse = await verifyAndDecrypt(response.data, config);
        const redirectLink = decryptedResponse.links.find(link => link.rel === 'redirect');

        return sendSuccess(res, {
            orderId,
            bdOrderId: decryptedResponse.bdorderid,
            redirect: {
                url:           redirectLink.href,
                parameters:    redirectLink.parameters,
                authorization: redirectLink.headers.authorization
            }
        }, "Order created successfully", 200);

    } catch (error) {
        logger.error(`[Billdesk] createOrder error: ${error.message}`);

        if (error.response?.data && !error.response.headers['content-type']?.includes('jose')) {
            logger.error(`[Billdesk] PHP error: ${JSON.stringify(error.response.data)}`);
            return sendError(res, error.response.data.message || 'PHP processing failed', 500);
        }

        if (error.response?.data) {
            try {
                const decResponse = await verifyAndDecrypt(error.response.data, config);
                logger.error(`[Billdesk] Decrypted BillDesk error: ${JSON.stringify(decResponse)}`);
            } catch (decryptError) {
                logger.error(`[Billdesk] Failed to decrypt error response: ${decryptError.message}`);
            }
        }

        return sendError(res, 'Payment initiation failed', 500);
    }
}

async function handleCallback(req, res) {
    try {
        logger.info(`[Billdesk] Payment callback received`);

        const jwsToken = req.body.transaction_response || req.body;

        if (!jwsToken || typeof jwsToken !== 'string') {
            logger.error(`[Billdesk] Invalid JWS token received`);

            try {
                await axios.post(`${PHP_API_URL}/academic_callback.php`, {
                    orderId: 'UNKNOWN',
                    billdeskResponse: { error: 'Invalid JWS token', rawBody: req.body },
                    authStatus: 'INVALID'
                }, { headers: { 'Content-Type': 'application/json' }, timeout: 30000 });
            } catch (saveError) {
                logger.error(`[Billdesk] Failed to save invalid token error to PHP: ${saveError.message}`);
            }

            return res.redirect(
                `/api/billdesk/payment-result?status=failed&message=${encodeURIComponent('Invalid response from payment gateway')}`
            );
        }

        const decryptedResponse = await verifyAndDecrypt(jwsToken, config);

        const {
            orderid:                orderId,
            amount:                 txnAmt,
            transactionid:          txnId,
            transaction_date:       txnDate,
            mercid:                 merchantId,
            auth_status:            authStatus,
            payment_method_type:    paymentMode,
            transaction_error_type: txnErrorType,
            bankid:                 bankTxnId
        } = decryptedResponse;

        logger.info(`[Billdesk] Callback for order: ${orderId}, authStatus: ${authStatus}`);

        const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
            || req.headers['x-real-ip']
            || req.connection?.remoteAddress
            || req.socket?.remoteAddress
            || req.ip
            || '0.0.0.0';

        const formattedTxnDate = txnDate
            ? new Date(txnDate).toISOString().slice(0, 19).replace('T', ' ')
            : new Date().toISOString().slice(0, 19).replace('T', ' ');

        // Determine payment type from order ID prefix
        let paymentTypeCode = 'ACA';
        if (orderId) {
            if      (orderId.includes('HOS')) paymentTypeCode = 'HOS';
            else if (orderId.includes('TRA')) paymentTypeCode = 'TRA';
            else if (orderId.includes('LIB')) paymentTypeCode = 'LIB';
            else if (orderId.includes('GYM')) paymentTypeCode = 'GYM';
            else if (orderId.includes('SCH')) paymentTypeCode = 'SCH';
            else if (orderId.includes('ACA')) paymentTypeCode = 'ACA';
        }

        const callbackUrlMap = {
            HOS: `${PHP_API_URL}/hostel_callback.php`,
            TRA: `${PHP_API_URL}/transport_callback.php`,
            LIB: `${PHP_API_URL}/library_callback.php`,
            GYM: `${PHP_API_URL}/gym_callback.php`,
            SCH: `${PHP_API_URL}/school_callback.php`,
            ACA: `${PHP_API_URL}/academic_callback.php`,
        };

        const callbackUrl = callbackUrlMap[paymentTypeCode] || callbackUrlMap['ACA'];
        logger.info(`[Billdesk] Routing to ${paymentTypeCode} callback`);

        const phpPayload = {
            orderId,
            studentId:      '',
            childMerchantId: '',
            txnAmount:      txnAmt      || 0,
            txnId:          txnId       || '',
            txnDate:        formattedTxnDate,
            merchantId:     merchantId  || '',
            authStatus,
            paymentMode:    paymentMode || 'UPI',
            bankTxnId:      bankTxnId   || '',
            ipAddress:      clientIp,
            status:         authStatus === '0300' ? 'SUCCESS' : 'FAILED',
            billdeskResponse: decryptedResponse
        };

        const phpResponse = await axios.post(callbackUrl, phpPayload, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 60000
        });

        if (!phpResponse.data.success) {
            logger.error(`[Billdesk] PHP callback failed: ${phpResponse.data.message}`);
            return res.redirect(
                `/api/billdesk/payment-result?status=failed&message=${encodeURIComponent(phpResponse.data.message || 'Payment processing failed')}&orderId=${orderId}`
            );
        }

        if (authStatus === '0300') {
            logger.info(`[Billdesk] Payment SUCCESS for order: ${orderId}`);
            return res.redirect(
                `/api/billdesk/payment-result?status=success&message=Payment Successful&orderId=${orderId}&txnId=${txnId}&amount=${txnAmt}`
            );
        }

        logger.info(`[Billdesk] Payment FAILED for order: ${orderId}, status: ${authStatus}`);
        return res.redirect(
            `/api/billdesk/payment-result?status=failed&message=${encodeURIComponent(getErrorMessage(authStatus, txnErrorType))}&orderId=${orderId}`
        );

    } catch (error) {
        logger.error(`[Billdesk] handleCallback error: ${error.message}`);

        try {
            await axios.post(`${PHP_API_URL}/academic_callback.php`, {
                orderId: 'ERROR',
                billdeskResponse: { error: error.message },
                authStatus: 'ERROR'
            }, { headers: { 'Content-Type': 'application/json' }, timeout: 10000 });
        } catch (logError) {
            logger.error(`[Billdesk] Failed to log callback error to PHP: ${logError.message}`);
        }

        return res.redirect(
            `/api/billdesk/payment-result?status=failed&message=${encodeURIComponent('Payment processing error')}`
        );
    }
}

async function getPaymentStatus(req, res) {
    try {
        const { orderId } = req.params;

        if (!orderId) {
            return sendError(res, 'Order ID is required', 400);
        }

        logger.info(`[Billdesk] Fetching payment status for order: ${orderId}`);

        const transaction = await PaymentModel.getTransactionBegin(orderId);

        if (!transaction) {
            return sendError(res, 'Transaction not found', 404);
        }

        let status = 'PENDING';
        if      (transaction.flag === 1) status = 'SUCCESS';
        else if (transaction.flag === 0) status = 'FAILED';

        return sendSuccess(res, {
            orderId:  transaction.order_id,
            amount:   transaction.tot_amt,
            status,
            txnId:    transaction.txn_id   || null,
            txnDate:  transaction.txn_date  || null
        }, "Payment status retrieved successfully", 200);

    } catch (error) {
        logger.error(`[Billdesk] getPaymentStatus error: ${error.message}`);
        return sendError(res, 'Failed to get payment status', 500);
    }
}

module.exports = {
    createOrder,
    handleCallback,
    getPaymentStatus
};