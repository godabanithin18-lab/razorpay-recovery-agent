// test-webhook.js
// Fires a fake Razorpay "payment.failed" event at your local server
// so you can test the flow before wiring up the real dashboard webhook.
// Run: node test-webhook.js

const http = require('http');

const fakeEvent = {
  event: 'payment.failed',
  payload: {
    payment: {
      entity: {
        id: 'pay_test_' + Math.floor(Math.random() * 100000),
        amount: 50000, // in paise = ₹500
        error_reason: 'card_declined', // try: card_declined, network_error, bank_server_down, or something random
      }
    }
  }
};

const data = JSON.stringify(fakeEvent);

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/webhook/razorpay',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
  },
};

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  res.on('data', (chunk) => console.log(chunk.toString()));
});

req.on('error', (e) => console.error(e));
req.write(data);
req.end();