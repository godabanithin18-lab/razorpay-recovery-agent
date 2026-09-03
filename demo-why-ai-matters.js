// demo-why-ai-matters.js
// A focused, narrated demo proving the two claims at the heart of the pitch:
//
// 1) CONTEXT CHANGES THE DECISION — the same failure type gets a different
//    AI decision depending on retry history, proving this isn't a static
//    lookup table.
// 2) DETERMINISTIC RULES CATCH UNSAFE AI SUGGESTIONS — the safety layer
//    overrides the AI when its suggestion violates a business rule,
//    proving the AI is never blindly trusted with money.
//
// Run: node demo-why-ai-matters.js  (server must be running)

const http = require('http');

function send(reason, paymentId, label) {
  return new Promise((resolve) => {
    const fakeEvent = {
      event: 'payment.failed',
      payload: {
        payment: {
          entity: { id: paymentId, amount: 150000, error_reason: reason }
        }
      }
    };
    const data = JSON.stringify(fakeEvent);
    const options = {
      hostname: 'localhost', port: 3000, path: '/webhook/razorpay', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        console.log(`\n▶ ${label}`);
        console.log(`  Response: ${body}`);
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log(' DEMO 1: Does context change the AI decision?');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Sending the SAME failure type (network_error) 3 times for');
  console.log('the SAME payment. Watch the server terminal — the action');
  console.log('should change once retry history builds up.\n');

  const demoPaymentId = 'pay_demo_context_001';
  await send('network_error', demoPaymentId, 'Attempt 1 — no retry history yet');
  await new Promise(r => setTimeout(r, 700));
  await send('network_error', demoPaymentId, 'Attempt 2 — one retry already tried');
  await new Promise(r => setTimeout(r, 700));
  await send('network_error', demoPaymentId, 'Attempt 3 — SAME failure type, but retry limit hit');

  console.log('\n→ Check the server terminal: attempts 1-2 should show');
  console.log('  "auto_retry", but attempt 3 should show "escalate_to_human"');
  console.log('  — same failure_reason, different decision, because context');
  console.log('  (retry history) changed.\n');

  await new Promise(r => setTimeout(r, 1500));

  console.log('═══════════════════════════════════════════════════════');
  console.log(' DEMO 2: Does the safety layer catch an unsafe AI call?');
  console.log('═══════════════════════════════════════════════════════');
  console.log('Sending an insufficient_funds failure. If the AI ever');
  console.log('suggests "auto_retry" for this (immediately retrying a');
  console.log('payment that failed for lack of funds is not useful and');
  console.log('could annoy the customer), the business-rule validator');
  console.log('should catch and override it.\n');

  await send('insufficient_funds', 'pay_demo_safety_001', 'Insufficient funds — watch for a business-rule override');

  console.log('\n→ Check the server terminal for this payment. If the AI');
  console.log('  suggested anything other than "send_reminder_delay" or');
  console.log('  "escalate_to_human", the reasoning field will show a');
  console.log('  business-rule override message.\n');

  console.log('Demo complete.');
}

run();