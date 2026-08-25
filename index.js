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
// --- idempotency + retry tracking (persisted to a local file) ---
const STATE_FILE = './payment-state.json';

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return {};
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

const MAX_RETRIES = 2;
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

Also give:
- a confidence score from 0-100 for how certain you are this is the right action
- a risk_level: "low", "medium", or "high" — how risky this action is if it turns out to be wrong

If your confidence would be below 70, choose "escalate_to_human" instead — do not act on a low-confidence guess with real money.

Respond ONLY with valid JSON in this exact format, nothing else:
{"action": "<one of the actions above>", "reasoning": "<one sentence explaining why, referencing the specific failure reason>", "confidence": <number 0-100>, "risk_level": "<low|medium|high>"}`;
  const VALID_ACTIONS = ['auto_retry', 'auto_retry_delayed', 'send_reminder_delay', 'suggest_alternate_method', 'escalate_to_human'];
  const VALID_RISK_LEVELS = ['low', 'medium', 'high'];

  // Which actions are allowed for which failure reasons — a second line of
  // defense so the AI can never pick something nonsensical for the situation.
  const ALLOWED_ACTIONS_BY_REASON = {
    insufficient_funds: ['send_reminder_delay', 'escalate_to_human'],
    card_declined: ['suggest_alternate_method', 'escalate_to_human'],
    network_error: ['auto_retry', 'escalate_to_human'],
    bank_server_down: ['auto_retry_delayed', 'escalate_to_human'],
  };

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'openai/gpt-oss-20b',
      temperature: 0.3,
    });

    const raw = completion.choices[0].message.content.trim();
    const parsed = JSON.parse(raw);

    // --- Structural validation: never trust the LLM's output blindly ---
    if (!VALID_ACTIONS.includes(parsed.action)) {
      throw new Error(`AI returned an invalid action: "${parsed.action}"`);
    }
    if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 100) {
      throw new Error(`AI returned an invalid confidence value: "${parsed.confidence}"`);
    }
    if (!VALID_RISK_LEVELS.includes(parsed.risk_level)) {
      throw new Error(`AI returned an invalid risk_level: "${parsed.risk_level}"`);
    }

    // --- Business-rule validation: is this action even allowed for this reason? ---
    const allowedForReason = ALLOWED_ACTIONS_BY_REASON[reasonCode];
    if (allowedForReason && !allowedForReason.includes(parsed.action)) {
      return {
        action: 'escalate_to_human',
        note: `AI suggested "${parsed.action}" for "${reasonCode}", which isn't a permitted action for this failure type — escalated as a safety precaution.`,
        confidence: parsed.confidence,
        risk_level: 'high',
      };
    }

    // --- Confidence safety net ---
    if (parsed.confidence < 70) {
      return {
        action: 'escalate_to_human',
        note: `Low AI confidence (${parsed.confidence}%) on original suggestion "${parsed.action}" — escalated as a safety precaution. Original reasoning: ${parsed.reasoning}`,
        confidence: parsed.confidence,
        risk_level: parsed.risk_level,
      };
    }

    return { action: parsed.action, note: parsed.reasoning, confidence: parsed.confidence, risk_level: parsed.risk_level };
  } catch (err) {
    console.error('AI classification failed or returned invalid data, falling back to safe default:', err.message);
    return { action: 'escalate_to_human', note: `AI reasoning failed validation (${err.message}) — flagged for manual review as a safe fallback`, confidence: 0, risk_level: 'high' };
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

    // --- idempotency check: has this exact payment already been processed? ---
    const state = loadState();
    const existing = state[payment.id];

    if (existing && existing.finalized) {
      console.log(`[SKIPPED] Payment ${payment.id} already finalized (action: ${existing.action}) — ignoring duplicate webhook.`);
      return res.status(200).json({ received: true, skipped: 'already processed' });
    }

    const retryCount = existing ? existing.retryCount : 0;

    // --- max retry check: force escalation if we've already retried too many times ---
    let decision;
    if (retryCount >= MAX_RETRIES) {
      decision = {
        action: 'escalate_to_human',
        note: `Payment ${payment.id} already retried ${retryCount} times without success — escalating instead of retrying again.`,
        confidence: 100,
        risk_level: 'medium',
      };
    } else {
      decision = await classifyFailure(reasonCode, payment.amount);
    }

    // --- update state: track retry count, mark finalized if not a retry action ---
    const isRetryAction = decision.action === 'auto_retry' || decision.action === 'auto_retry_delayed';
    state[payment.id] = {
      retryCount: isRetryAction ? retryCount + 1 : retryCount,
      finalized: !isRetryAction, // retries stay open in case they fail again; everything else is final
      action: decision.action,
    };
    saveState(state);
        logDecision({
      payment_id: payment.id,
      amount: payment.amount,
      failure_reason: reasonCode,
      action_taken: decision.action,
      reasoning: decision.note,
      confidence: decision.confidence,
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