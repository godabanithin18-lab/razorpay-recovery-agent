// index.js
// Payment Failure Recovery Agent — Day 1 skeleton
// Receives Razorpay "payment.failed" webhooks, logs them, and (for now)
// runs a rule-based decision. AI decision-making gets added on Day 6-8.

require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');

const app = express();

// IMPORTANT: Razorpay signs webhooks using the raw request body.
// We must capture the raw body BEFORE express.json() parses it,
// otherwise signature verification will always fail.
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const PORT = process.env.PORT || 3000;
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET; // set this after creating the webhook in dashboard

// --- simple audit log (append to a local JSON file) ---
const LOG_FILE = './audit-log.json';
function logDecision(entry) {
  const record = { ...entry, timestamp: new Date().toISOString() };
  let logs = [];
  if (fs.existsSync(LOG_FILE)) {
    logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  }
  logs.push(record);
  fs.writeFileSync(LOG_FILE, JSON.stringify(logs, null, 2));
  console.log('[LOGGED]', record);
}

// --- webhook signature verification ---
function isValidSignature(rawBody, signatureHeader) {
  if (!WEBHOOK_SECRET) return true; // allow testing before secret is set
  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(rawBody)
    .digest('hex');
  return expected === signatureHeader;
}

// --- rule-based classifier (Day 3-5 baseline, before AI layer) ---
// --- AI-powered classifier using Groq (Llama 3.1) ---
const Groq = require('groq-sdk');
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function classifyFailure(reasonCode, amount) {
  const prompt = `You are a payment recovery agent for an Indian fintech platform using Razorpay.
A payment just failed. Here are the details:
- Failure reason code: ${reasonCode}
- Amount: ₹${amount / 100}

Decide the best recovery action. Choose exactly one action from this list:
- "auto_retry" (for transient issues like network errors — safe to silently retry immediately)
- "auto_retry_delayed" (for bank-side issues like server downtime — retry after a delay)
- "send_reminder_delay" (for insufficient funds — remind customer later, e.g. after a few hours)
- "suggest_alternate_method" (for card declines — prompt customer to try UPI or another card)
- "escalate_to_human" (for anything unclear, suspicious, or not covered above — never guess on risky cases)

Respond ONLY with valid JSON in this exact format, nothing else:
{"action": "<one of the actions above>", "reasoning": "<one sentence explaining why, referencing the specific failure reason>"}`;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'openai/gpt-oss-20b',
      temperature: 0.3,
    });

    const raw = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(raw);
    return { action: parsed.action, note: parsed.reasoning };
  } catch (err) {
    console.error('AI classification failed, falling back to safe default:', err.message);
    return { action: 'escalate_to_human', note: 'AI reasoning failed — flagged for manual review as a safe fallback' };
  }
}

// --- webhook endpoint ---
app.post('/webhook/razorpay', async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];

  if (!isValidSignature(req.rawBody, signature)) {
    console.warn('Invalid webhook signature — rejected');
    return res.status(400).json({ error: 'invalid signature' });
  }

  const event = req.body;

  if (event.event === 'payment.failed') {
    const payment = event.payload.payment.entity;
    const reasonCode = payment.error_reason || 'unknown';

    const decision = await classifyFailure(reasonCode, payment.amount);

    logDecision({
      payment_id: payment.id,
      amount: payment.amount,
      failure_reason: reasonCode,
      action_taken: decision.action,
      reasoning: decision.note,
    });

    // TODO (Day 6-8): replace/augment classifyFailure() with an LLM call
    // that reads full payment context and decides + explains the action.
  }

  res.status(200).json({ received: true });
});

app.get('/', (req, res) => {
  res.send('Recovery agent running. POST Razorpay webhooks to /webhook/razorpay');
});

app.listen(PORT, () => {
  console.log(`Recovery agent listening on port ${PORT}`);
});