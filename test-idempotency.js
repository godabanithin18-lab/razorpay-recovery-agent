// test-idempotency.js
// Sends the SAME payment_id 4 times in a row to prove:
// 1) duplicate webhooks don't get double-processed once finalized
// 2) retries stop after MAX_RETRIES and force an escalation
// Run: node test-idempotency.js (server must be running)

const http = require('http');

const FIXED_PAYMENT_ID = 'pay_idempotency_test_001';

function sendOne(reason, attemptLabel) {
  return new Promise((resolve) => {
    const fakeEvent = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: FIXED_PAYMENT_ID, // SAME ID every time, on purpose
            amount: 250000,
            error_reason: reason,
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
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        console.log(`\n--- ${attemptLabel} ---`);
        console.log('Response:', body);
        resolve();
      });
    });

    req.on('error', () => resolve());
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log(`Testing idempotency + retry limits with fixed payment_id: ${FIXED_PAYMENT_ID}\n`);
  await sendOne('network_error', 'Attempt 1 (first time seeing this payment)');
  await new Promise(r => setTimeout(r, 800));
  await sendOne('network_error', 'Attempt 2 (same payment fails again)');
  await new Promise(r => setTimeout(r, 800));
  await sendOne('network_error', 'Attempt 3 (should hit MAX_RETRIES, force escalate)');
  await new Promise(r => setTimeout(r, 800));
  await sendOne('network_error', 'Attempt 4 (already finalized — should be SKIPPED)');
  console.log('\nDone. Check the server terminal for [LOGGED] and [SKIPPED] entries.');
}

run();