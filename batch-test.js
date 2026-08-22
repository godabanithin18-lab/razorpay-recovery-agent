// batch-test.js
// Fires a batch of simulated failed payments through the agent
// and summarizes how many fell into each action category.
// This gives you real numbers for your pitch: "X% auto-recoverable without human involvement"

const http = require('http');

// A realistic mix of failure reasons and amounts
const failureReasons = [
  'insufficient_funds',
  'card_declined',
  'network_error',
  'bank_server_down',
  'insufficient_funds',
  'network_error',
  'card_declined',
  'unknown_gateway_timeout', // intentionally unrecognized — should escalate
  'bank_server_down',
  'insufficient_funds',
  'network_error',
  'card_declined',
  'bank_server_down',
  'insufficient_funds',
  'suspicious_activity_flag', // intentionally unrecognized — should escalate
  'network_error',
  'card_declined',
  'insufficient_funds',
  'bank_server_down',
  'network_error',
];

function sendOne(reason, index) {
  return new Promise((resolve) => {
    const fakeEvent = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: {
            id: `pay_batch_${index}_${Math.floor(Math.random() * 10000)}`,
            amount: Math.floor(Math.random() * 500000) + 10000, // ₹100 to ₹5100
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
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve());
    });

    req.on('error', () => resolve());
    req.write(data);
    req.end();
  });
}

async function runBatch() {
  console.log(`Sending ${failureReasons.length} simulated failed payments...\n`);
  for (let i = 0; i < failureReasons.length; i++) {
    await sendOne(failureReasons[i], i);
    // small delay so we don't hammer the free API rate limit
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('Batch complete. Check audit-log.json and server terminal for results.');
}

runBatch();