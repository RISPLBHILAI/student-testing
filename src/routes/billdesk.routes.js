const router = require('express').Router();
const { auth } = require('../../../shared/middlewares/auth');
const BilldeskCtrl = require('../controllers/billdesk/billdesk.controller');

// Create order
router.post(
    '/create-order',
    auth(),
    BilldeskCtrl.createOrder
);

// Payment callback from BillDesk (no auth - called by BillDesk server)
router.post(
    '/payment-callback',
    BilldeskCtrl.handleCallback
);

// Check payment status - for mobile app polling
router.get(
    '/payment-status/:orderId',
    auth(),
    BilldeskCtrl.getPaymentStatus
);

// Payment result page (shown in WebView)
router.get('/payment-result', (req, res) => {
    const { status, message, orderId, txnId, amount } = req.query;

    const isSuccess = status === 'success';

    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body {
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    background: ${isSuccess ? '#d4edda' : '#f8d7da'};
                }
                .container { text-align: center; padding: 20px; }
                .icon { font-size: 60px; margin-bottom: 20px; }
                h1 { color: ${isSuccess ? '#27ae60' : '#e74c3c'}; margin: 10px 0; }
                .details { color: #555; font-size: 14px; margin-top: 15px; }
                .details p { margin: 5px 0; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="icon">${isSuccess ? '✓' : '✗'}</div>
                <h1>${isSuccess ? 'Payment Successful' : 'Payment Failed'}</h1>
                <p>${message || ''}</p>
                ${orderId ? `
                <div class="details">
                    <p><strong>Order ID:</strong> ${orderId}</p>
                    ${txnId ? `<p><strong>Transaction ID:</strong> ${txnId}</p>` : ''}
                    ${amount ? `<p><strong>Amount:</strong> ₹${amount}</p>` : ''}
                </div>
                ` : ''}
                <p style="margin-top: 20px; color: #888;">Redirecting to app...</p>
            </div>

            <script>
                (function() {
                    const paymentData = {
                        type: 'PAYMENT_RESULT',
                        status: '${status || 'unknown'}',
                        orderId: '${orderId || ''}',
                        txnId: '${txnId || ''}',
                        amount: '${amount || ''}',
                        message: '${message || ''}'
                    };

                    console.log('Sending to React Native:', paymentData);

                    if (window.ReactNativeWebView) {
                        window.ReactNativeWebView.postMessage(JSON.stringify(paymentData));
                    }

                    setTimeout(function() {
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify(paymentData));
                        }
                    }, 500);

                    setTimeout(function() {
                        if (window.ReactNativeWebView) {
                            window.ReactNativeWebView.postMessage(JSON.stringify(paymentData));
                        }
                    }, 1000);
                })();
            </script>
        </body>
        </html>
    `);
});

module.exports = router;