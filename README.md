# 💳 Payment Failure Recovery Agent

### AI-powered revenue recovery for failed Razorpay payments

> **Don't just detect failed payments. Understand why they failed, decide what to do next, do it safely, and explain every decision.**

```text
FAILURE
   ↓
AI REASONING
   ↓
SAFETY VALIDATION
   ↓
RECOVERY / HUMAN ESCALATION
   ↓
MEASURED REVENUE

₹2,76,664 at risk
₹31,326 simulated recovered (11.3%)
93.6% handled automatically
0 unsafe AI suggestions were executed in the tested scenarios — deterministic validation blocks recommendations that violate configured safety rules before execution
```

**What is it?** An AI agent that reasons about *why* a Razorpay payment failed and picks a recovery action — validated by deterministic rules before anything is allowed to execute.

**Why does it matter?** Most failed payments get no follow-up at all today. This turns a dead-end into a reasoned, auditable recovery attempt.

**How does it work?** `Webhook → LLM call → Structured decision → Safety validator → Action`. See it in `index.js`: the LLM call happens in `classifyFailure()`, and its output is validated immediately below before anything runs.

**What did we prove?** Two things, both reproducible on demand:
- An unsafe AI suggestion gets blocked before it can act (`node safety-layer-demo.js` — no network needed)
- The same failure type produces a different decision depending on context (`node demo-why-ai-matters.js`)

**Demo:** `node killer-demo.js` runs both a live end-to-end recovery and a blocked-mistake case back to back — this is the fastest way to see the whole system in under a minute.

## ⚡ Judge in 60 Seconds

```text
1. Send payment.failed event
2. Agent analyzes failure + retry history
3. LLM proposes recovery action
4. Deterministic safety layer validates it
5. Safe → recovery / Unsafe → human escalation
6. Decision + reasoning → audit log
7. Dashboard → recovery metrics
```

```bash
node killer-demo.js
```

*(Everything below this point is supporting detail: architecture, full safety design, cost analysis, and the production roadmap.)*

---

Payment failures are not all the same.

A temporary network failure may be worth retrying immediately. A bank outage may require a delayed retry. Insufficient funds may require waiting and reminding the customer. A card decline may be better handled by suggesting another payment method.

Most basic payment integrations stop at:

```text
Payment Failed
      ↓
Show "Payment Failed"
      ↓
Customer leaves
      ↓
Potential revenue lost
```

**Payment Failure Recovery Agent** adds an intelligent recovery layer on top of Razorpay webhook events.

It receives a `payment.failed` event, analyzes the failure context using an LLM, selects the safest recovery strategy, validates that decision using deterministic business rules, and records the complete reasoning in an audit trail.

### Core principle

> **AI recommends. Rules validate. Infrastructure executes. Humans handle uncertainty.**

---

# 🎯 Proof: Why AI (Not Just Rules)

Three focused demos back the core architectural claim of this project — **AI reasons with context → deterministic rules validate → outcome adapts safely**:

```bash
node safety-layer-demo.js
```

This runs **offline, with no server or network needed** — it feeds the exact validation logic used in production a set of hypothetical AI outputs, including deliberately unsafe ones, and shows the guardrail catching them:

```text
CASE 2 — An UNSAFE AI suggestion: auto-retrying insufficient funds
  AI suggested:       auto_retry  (confidence: 94%)
  Safety check:       ❌ BLOCKED
  Reason:             "auto_retry" is not a permitted action for "insufficient_funds"
  Final action taken: escalate_to_human
```

> The point isn't that the AI is always correct. It's that an AI recommendation cannot directly trigger a financial action without passing deterministic safety validation.

```bash
node demo-why-ai-matters.js
```

**The same failure type produces a different decision** depending on context. Sending `network_error` three times for the same payment (server running) produces:

```text
Attempt 1 → auto_retry        (95% confidence)
Attempt 2 → auto_retry        (95% confidence)
Attempt 3 → escalate_to_human (100% confidence, retry limit reached)
```

Identical failure reason, different final action — because retry history (context) changed. This is not a static lookup table.

Combined with the audit-log-driven **Safety Interventions** panel on the dashboard (which surfaces cases from actual prototype runs where the AI's suggestion was overridden), this demonstrates the full loop: reasoning, validation, and — when needed — correction.

---

# 🖥️ Interactive Dashboard

Beyond the terminal and audit log, the project includes a generated HTML dashboard (`node generate-dashboard.js`) with:

* **Headline metrics** — revenue recovered, automation rate, escalation rate, average AI confidence
* **Revenue recovery bar** — visual progress of recovered vs. at-risk value
* **Action breakdown and execution outcome charts**
* **AI confidence distribution**
* **Safety Interventions panel** — automatically surfaces cases from actual prototype runs, drawn from the audit log, where deterministic validation overrode the AI's own suggestion (low confidence, business-rule violation, or retry-limit escalation), proving the safety layer is active rather than decorative
* **Click-to-expand decision detail** — clicking any recent decision opens the full reasoning, risk level, confidence, and execution outcome for that payment
* **Interactive Merchant ROI calculator** — plug in a merchant's transaction volume, failure rate, and order value to see projected recovered revenue and return on AI decisioning cost, using this project's own measured recovery rate as the default

Generate it with:

```bash
node generate-dashboard.js
```

Then open `dashboard.html` in a browser.

---

# 🏆 Razorpay AI Buildathon

**Track:** AI Revenue Recovery

### What this project demonstrates

* 🤖 LLM-powered recovery reasoning
* 🧠 Failure-specific decision making
* 🛡️ Deterministic AI guardrails
* 🔐 Webhook signature verification
* ♻️ Idempotent payment processing
* 🔁 Retry limits
* 👨‍💼 Human escalation
* 🧾 Complete audit trail
* 📊 Reproducible batch testing
* 💰 Revenue recovery focus
* 🏭 Production-oriented architecture

---

# 📊 Prototype Results

The current prototype was tested against **109 simulated payment failures**.

| Metric                    |        Result |
| -------------------------- | ---------------: |
| Simulated failures        |          **109** |
| Automatically handled     |     **93.6%** |
| Human escalation          |      **6.4%** |
| Maximum automatic retries |             **2** |
| AI confidence threshold   |            **70%** |
| Total value at risk       |  **₹2,76,664.25** |
| Amount recovered (simulated execution) | **₹31,326.05** |
| Recovery rate on total failed value | **11.3%** |

Run the test yourself:

```bash
node batch-test.js
node summarize.js
```

> These results come from the project's simulated batch test and simulated action execution (realistic success-rate modeling per action type — see "Action Execution" below), not from live Razorpay transactions.

---

# ⚡ Action Execution

Beyond deciding what to do, the agent **simulates executing** each recovery action and records a real outcome.

Each action type has a modeled success probability based on realistic patterns (e.g., a network-error auto-retry succeeds more often than a customer-dependent reminder):

| Action                      | Simulated success rate |
| ------------------------------ | -------------------------: |
| `auto_retry`                | 65% |
| `auto_retry_delayed`        | 55% |
| `send_reminder_delay`       | 30% |
| `suggest_alternate_method`  | 45% |
| `escalate_to_human`         | N/A — pending human review |

Every execution outcome (`recovered` / `not_recovered` / `pending_human_review`) and the resulting ₹ amount recovered is written to the audit log, which is how the headline recovery metrics above are calculated — not estimated after the fact.

> This is a modeled simulation, not a connection to live payment execution. It exists to demonstrate what "recovery execution" would measure once connected to real retry/notification infrastructure.

---

# 🎯 The Problem

When a payment fails, businesses often know **that** it failed but not **what they should do next**.

Consider these failures:

```text
Network timeout
      ↓
Retry may work

Bank server unavailable
      ↓
Wait and retry

Insufficient funds
      ↓
Immediate retry probably won't help

Card declined
      ↓
Try another payment method

Unknown failure
      ↓
Human investigation
```

A single generic recovery workflow cannot handle all of these situations intelligently.

The result can be:

* unnecessary retries
* poor customer experience
* delayed recovery
* avoidable human effort
* lost revenue

---

# 💡 The Solution

The Recovery Agent turns a payment failure into a **reasoned recovery decision**.

```text
Razorpay payment.failed
          ↓
Extract failure context
          ↓
AI reasoning
          ↓
Recovery recommendation
          ↓
Confidence + risk validation
          ↓
Business-rule validation
          ↓
┌─────────┴──────────┐
↓                    ↓
Safe action       Uncertain /
                   unsafe
↓                    ↓
Recovery          Human escalation
          \          /
           \        /
            ↓      ↓
             Audit Log
```

Instead of:

> **"Payment failed → retry."**

the system asks:

> **"Why did it fail, what recovery action has the best chance of helping, and is it safe to automate?"**

---

# 🤖 Why This Is an AI Agent

This system is more than a classifier or a fixed `if/else` workflow.

The agent follows a decision loop:

### 1. Observe

Receives:

```text
payment.failed
```

from Razorpay.

### 2. Understand

Extracts relevant context such as:

* payment ID
* failure reason
* payment amount
* retry history

### 3. Reason

The LLM evaluates the failure and recommends a recovery strategy.

### 4. Decide

The agent produces:

```text
action
confidence
risk
reasoning
```

### 5. Validate

The recommendation is checked against deterministic business rules.

### 6. Act or Escalate

Safe decisions continue.

Uncertain or invalid decisions are escalated.

### 7. Audit

The complete decision is recorded.

A traditional recovery system would look like `Failure Type → Fixed Rule → Fixed Action`. This project adds contextual reasoning — the same failure type can produce a different action depending on payment context and retry history, because the LLM reasons over that context rather than looking up a static table. But the LLM is **never treated as an unrestricted authority** over financial actions:

> **The AI proposes. Deterministic safeguards decide whether the proposal is allowed.**

---

# 🔄 Recovery Strategies

| Failure Scenario             | Recovery Action            | Why                                          |
| ----------------------------- | --------------------------- | --------------------------------------------- |
| Transient network error      | `auto_retry`               | Temporary failures may recover immediately   |
| Bank-side server downtime    | `auto_retry_delayed`       | Give the bank time to recover                |
| Insufficient funds           | `send_reminder_delay`      | Immediate retry is unlikely to help          |
| Card declined                | `suggest_alternate_method` | Customer can try another payment method      |
| Unknown / suspicious failure | `escalate_to_human`        | Never guess on an unclear financial decision |

---

# 🧪 Example AI Decision

For an insufficient-funds failure, the agent could produce a structured decision such as:

```json
{
  "action": "send_reminder_delay",
  "confidence": 91,
  "risk": "low",
  "reasoning": "The payment failed because the customer's available balance was insufficient. An immediate retry is unlikely to help, so a delayed reminder is safer."
}
```

The recommendation is then validated before it can be accepted.

This makes the decision:

**structured + explainable + auditable + constrained**

rather than simply:

```text
LLM → execute
```

---

# 🛡️ Safety Architecture

Because this system deals with payment recovery, reliability is more important than blindly maximizing automation.

The project uses multiple safety layers.

---

## 1. Structured Output Validation

The AI must return valid structured data containing:

```text
action
confidence
risk
reasoning
```

Malformed, incomplete, or unexpected responses are rejected.

---

## 2. Business-Rule Enforcement

The AI's recommendation is checked against deterministic rules.

For example:

```text
insufficient_funds
        ↓
AI says: auto_retry
        ↓
Business Rule
        ↓
❌ Not permitted
        ↓
escalate_to_human
```

The system never assumes that an LLM recommendation is automatically valid.

---

## 3. Confidence Threshold

The agent requires at least:

```text
70% confidence
```

If the AI reports lower confidence:

```text
AI confidence < 70%
        ↓
Override recommendation
        ↓
escalate_to_human
```

---

## 4. Idempotency

Payment providers may send the same webhook more than once.

The system tracks payment state in:

```text
payment-state.json
```

If a payment has already been processed:

```text
Duplicate webhook
       ↓
Already processed?
       ↓
YES
       ↓
Ignore safely
```

This prevents duplicate processing.

---

## 5. Retry Limits

Automatic retries are limited to **2 attempts**.

```text
Failure #1 → Retry
Failure #2 → Retry
Failure #3 → Human escalation
```

This prevents infinite retry loops.

---

## 6. Safe LLM Failure Handling

If the AI:

* becomes unavailable
* times out
* returns malformed output
* returns an invalid action
* violates a business rule
* reports insufficient confidence

the system does not guess.

Instead:

```text
AI Failure
    ↓
Safe fallback
    ↓
escalate_to_human
```

> **When uncertain, don't guess. Escalate.**

---

# 🔐 Webhook Security

The application verifies Razorpay webhook signatures using Node.js's native:

```text
crypto
```

Invalid webhook signatures are rejected before payment processing begins.

This ensures that arbitrary requests cannot simply be treated as legitimate Razorpay payment events.

---

# 🏗️ System Architecture

```text
                         ┌─────────────────┐
                         │    Razorpay     │
                         │    Webhooks     │
                         └────────┬────────┘
                                  │
                           payment.failed
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Express Server  │
                         │    index.js     │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   Signature     │
                         │   Verification  │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   Idempotency   │
                         │      Check      │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │ Failure Context │
                         │ reason + amount │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │    Groq LLM     │
                         │   gpt-oss-20b   │
                         └────────┬────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │   AI Recovery Decision │
                     │                        │
                     │ action                 │
                     │ confidence             │
                     │ risk                   │
                     │ reasoning              │
                     └───────────┬────────────┘
                                 │
                                 ▼
                     ┌────────────────────────┐
                     │ Deterministic Safety   │
                     │       Validation       │
                     └───────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
             Safe Decision             Unsafe / Unclear
                    │                         │
                    ▼                         ▼
          ┌──────────────────┐       ┌──────────────────┐
          │ Recovery Action  │       │ Human Escalation │
          └────────┬─────────┘       └────────┬─────────┘
                   │                          │
                   └────────────┬─────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Audit Log     │
                       │ audit-log.json  │
                       └─────────────────┘
```

---

# ⏱️ Delayed Retry Architecture

The prototype can **decide** that a delayed retry is appropriate.

In production, the actual scheduling should be handled by a reliable job-queue infrastructure rather than keeping the Express process waiting.

A production implementation could use:

* Redis-based queues
* AWS SQS
* another durable job scheduler

### Production flow

```text
Payment Failed
      ↓
AI decides:
auto_retry_delayed
      ↓
Create Recovery Job
      ↓
┌─────────────────────┐
│ Durable Job Queue   │
│                     │
│ retry_at = +30 min  │
└──────────┬──────────┘
           │
           │ wait
           ▼
      Worker Service
           │
           ▼
    Re-check payment
           │
      ┌────┴────┐
      ↓         ↓
   Failed     Success
      ↓         ↓
    Retry     Stop
```

### Why use a queue?

A durable queue provides:

* delayed execution
* job persistence
* worker retries
* concurrency control
* failure recovery
* dead-letter handling
* observability

The separation of responsibilities is important:

> **AI decides what should happen. The queue decides when it happens.**

---

# 🔁 Production Recovery Flow

```text
payment.failed
      ↓
Recovery Agent
      ↓
AI Decision
      ↓
Business Validation
      ↓
┌───────────────┬────────────────┐
↓               ↓                ↓
Immediate       Delayed          Human
Action          Action           Review
↓               ↓                ↓
Execute       Queue Job        Merchant
                ↓              Workflow
             Worker
                ↓
             Execute
```

This architecture keeps AI reasoning independent from the infrastructure responsible for execution and scheduling.

---

# 💰 Business Impact

The goal is not simply to automate payment failures.

The goal is to **recover revenue that would otherwise be lost.**

Consider a hypothetical merchant processing:

```text
10,000 payments / month
```

With a hypothetical:

```text
5% failure rate
```

that produces:

```text
500 failed payments
```

If a recovery system eventually recovers only:

```text
20%
```

then:

```text
500 × 20% = 100 recovered payments
```

At a hypothetical average order value of:

```text
₹1,000
```

the potential recovered revenue would be:

```text
100 × ₹1,000
= ₹1,00,000
```

> **This is an illustrative scenario, not a measured result from this prototype.**

The actual business value depends on:

* payment volume
* failure rate
* average order value
* recovery success rate
* customer behavior
* recovery strategy
* notification costs

---

# 💵 Cost vs. Benefit Analysis

An AI recovery system also needs to make economic sense.

The basic model is:

```text
AI Decision Cost
        ↓
Compare against
        ↓
Potential Recovered Revenue
```

For example:

```text
Failed payments / month
        ×
AI calls per payment
        ×
Average cost per AI call
        =
Monthly AI decisioning cost
```

And:

```text
Failed payments
        ×
Recovery success rate
        ×
Average order value
        =
Potential recovered revenue
```

The business case can therefore be expressed as:

```text
Potential recovered revenue
          ÷
AI decisioning cost
          =
Recovery value / AI cost
```

### Real cost reference

Using Groq's published pricing for `openai/gpt-oss-20b` (verified current: $0.075 per million input tokens, $0.30 per million output tokens), a single classification call (~150 input tokens, ~60 output tokens) works out to:

```text
150 × $0.075 / 1,000,000 = $0.00001125   (input)
 60 × $0.30  / 1,000,000 = $0.000018     (output)
                            ────────────
                            $0.00002925 ≈ $0.00003 per decision (~₹0.0025)
```

— negligible next to the value of even a single recovered payment.

### Important cost considerations

The actual cost per decision depends on:

* model pricing
* prompt size
* output size
* number of LLM calls
* failure/retry behavior
* caching or deterministic routing

### Optimization opportunity

A production implementation could reduce unnecessary LLM calls by using deterministic rules for obvious cases.

For example:

```text
Known failure
     ↓
Can deterministic rule safely handle it?
     │
   YES ─────→ No LLM call
     │
    NO
     ↓
Use LLM reasoning
```

This creates a **hybrid routing architecture** where AI is used when reasoning provides meaningful value.

---

# 📈 Measuring Real Recovery Value

The prototype currently focuses on decisioning.

A production deployment should measure the complete business funnel:

```text
Payment Failure
      ↓
Recovery Decision
      ↓
Recovery Attempt
      ↓
Payment Success?
      ↓
Revenue Recovered
```

Important production metrics would include:

| Metric                | Purpose                   |
| ---------------------- | -------------------------- |
| Failure rate          | Understand payment health |
| Recovery attempt rate | Measure automation        |
| Recovery success rate | Measure effectiveness     |
| Revenue recovered     | Measure business value    |
| Escalation rate       | Measure human workload    |
| AI confidence         | Monitor decision quality  |
| Average recovery time | Measure speed             |
| Cost per recovery     | Measure efficiency        |

The ultimate metric is not:

> **"How many AI decisions did we make?"**

It is:

> **"How much revenue did those decisions recover safely?"**

---

# 🔍 Failure Handling Matrix

| Situation                 | System Response          |
| --------------------------- | --------------------------- |
| Invalid webhook signature | Reject request             |
| Duplicate webhook         | Ignore duplicate           |
| Transient network failure | Consider immediate retry   |
| Bank-side outage          | Delayed retry               |
| Insufficient funds        | Delayed reminder           |
| Card decline              | Suggest alternate method   |
| Unknown failure           | Human escalation           |
| AI unavailable            | Human escalation           |
| Invalid AI response       | Human escalation           |
| Confidence < 70%          | Human escalation           |
| Business-rule violation   | Human escalation           |
| Retry limit exceeded      | Human escalation           |

---

# 🧾 Auditability

Every recovery decision is recorded in:

```text
audit-log.json
```

The audit trail can capture:

```text
Payment ID
Failure reason
Payment amount
AI recommendation
Confidence
Risk
Reasoning
Final action
Timestamp
```

This creates a traceable history of:

```text
What happened?
      ↓
What did the AI recommend?
      ↓
Why?
      ↓
Was the recommendation allowed?
      ↓
What was the final action?
```

This is particularly important for financial systems where unexplained automation can be difficult to trust or debug.

---

# 🧪 Testing

## Run the server

```bash
npm start
```

## Test a single failed payment

In another terminal:

```bash
node test-webhook.js
```

## Run the batch test

```bash
node batch-test.js
```

## Generate the summary

```bash
node summarize.js
```

The batch test provides a reproducible way to evaluate the recovery logic across multiple simulated failure scenarios.

---

# 📁 Project Structure

```text
razorpay-recovery-agent/
│
├── index.js
│
├── test-webhook.js
├── batch-test.js
├── summarize.js
├── test-idempotency.js
├── demo-why-ai-matters.js
├── safety-layer-demo.js
├── killer-demo.js
├── generate-dashboard.js
│
├── audit-log.json
├── payment-state.json
├── dashboard.html
│
├── package.json
├── .env.example
├── .gitignore
└── README.md
```

### Key files

| File                    | Purpose                                    |
| ------------------------ | -------------------------------------------- |
| `index.js`              | Express webhook server and recovery logic  |
| `test-webhook.js`       | Simulates an individual payment failure    |
| `batch-test.js`         | Runs multiple simulated failures           |
| `summarize.js`          | Generates batch-test metrics               |
| `test-idempotency.js`   | Verifies duplicate-webhook and retry-limit handling |
| `demo-why-ai-matters.js` | Focused demo proving contextual reasoning and safety-layer validation |
| `safety-layer-demo.js`  | Offline unit test proving the safety layer blocks unsafe AI outputs |
| `killer-demo.js`        | The single end-to-end demo — a live recovery followed by a blocked unsafe suggestion |
| `generate-dashboard.js` | Generates a visual HTML dashboard from the audit log |
| `dashboard.html`        | Generated output — open in a browser to view          |
| `audit-log.json`        | Stores decision audit trail                |
| `payment-state.json`    | Tracks payment processing and retry state  |
| `.env.example`          | Environment variable template              |

---

# ⚙️ Tech Stack

| Technology            | Purpose                           |
| ----------------------- | ------------------------------------ |
| **Node.js**           | Application runtime               |
| **Express.js**        | Webhook server                    |
| **Groq API**          | LLM inference                     |
| **gpt-oss-20b**       | AI reasoning                      |
| **Razorpay Webhooks** | Payment failure events            |
| **Node.js crypto**    | Signature verification            |
| **JSON**              | Prototype state and audit storage |

---

# 🚀 Quick Start

## 1. Clone the repository

```bash
git clone https://github.com/godabanithin18-lab/razorpay-recovery-agent.git
cd razorpay-recovery-agent
```

## 2. Install dependencies

```bash
npm install
```

## 3. Create environment configuration

```bash
cp .env.example .env
```

Add your Groq API key:

```env
GROQ_API_KEY=your_api_key_here
```

## 4. Start the application

```bash
npm start
```

## 5. Simulate a payment failure

Open another terminal:

```bash
node test-webhook.js
```

## 6. Run the complete batch test

```bash
node batch-test.js
node summarize.js
```

---

# 🏭 Prototype → Production

The current implementation intentionally uses lightweight local components so the complete system can be demonstrated easily.

A production deployment could evolve into:

| Prototype              | Production                             |
| ------------------------ | ------------------------------------------ |
| JSON audit log         | PostgreSQL / MongoDB                   |
| JSON payment state     | Redis / Database                       |
| Local Express server   | Cloud deployment                       |
| Simulated webhook      | Production Razorpay webhook            |
| Local recovery actions | Real payment/notification integrations |
| Local secrets          | Cloud secret manager                   |
| CLI metrics            | Merchant analytics dashboard           |
| No queue               | Redis / AWS SQS                        |
| Manual inspection      | Human-in-the-loop dashboard            |

The core decision architecture can remain the same while the infrastructure scales around it.

---

# 🔮 Future Improvements

## 1. Merchant Dashboard

Provide a dashboard showing:

* failed payments
* recovery decisions
* recovery success rate
* revenue recovered
* escalation rate
* AI confidence
* recovery time

---

## 2. Real Recovery Integrations

Connect decisions to actual application-level recovery workflows such as:

* payment-link regeneration
* customer notifications
* alternate payment-method prompts
* merchant workflows

---

## 3. Customer-Level Personalization

Instead of only considering the failure type, future versions could consider historical context such as:

```text
Customer
   +
Previous payment behavior
   +
Failure type
   +
Order value
   ↓
Personalized recovery strategy
```

---

## 4. Human-in-the-Loop Approval

High-risk decisions could require merchant approval:

```text
AI Decision
     ↓
Risk Assessment
     ↓
High Risk?
     ↓
Human Approval
     ↓
Execute
```

---

## 5. Recovery Analytics

Track which strategies actually produce successful payments.

```text
Failure
   ↓
Recovery Strategy
   ↓
Customer Response
   ↓
Payment Success
   ↓
Revenue Recovered
```

This would allow the system to continuously evaluate which recovery strategies are most effective.

---

# ⚠️ Honest Scope & Limitations

This project does **not** claim that an AI system can force a failed payment to succeed.

Payment authentication may require customer participation, such as OTP verification, UPI approval, or other authorization.

In this prototype:

> **`auto_retry` represents initiating/recommending another application-level payment attempt.**

For one-time payments, the customer may still need to complete authentication.

True silent retries are more realistic for recurring/subscription scenarios where appropriate authorization already exists.

The current prototype focuses primarily on:

**failure detection → AI decisioning → validation → auditability**

rather than replacing Razorpay's payment infrastructure.

---

# 🔐 Design Philosophy

This project intentionally follows a conservative approach to financial automation.

```text
             ┌───────────────┐
             │      AI       │
             │    Reasons    │
             └───────┬───────┘
                     ↓
             ┌───────────────┐
             │ Deterministic │
             │    Rules      │
             └───────┬───────┘
                     ↓
             ┌───────────────┐
             │   Safe to     │
             │    Act?       │
             └───────┬───────┘
                 YES │ NO
                     │
          ┌──────────┴──────────┐
          ↓                     ↓
      Recovery              Human
       Action              Escalation
```

The goal is **not maximum automation at any cost**.

The goal is:

> **Maximum safe recovery.**

---

# 🏆 Why This Project

Existing payment infrastructure is good at processing payments. The missing layer for many merchants is what happens **after a payment fails** — this project combines Razorpay webhooks, LLM reasoning, business rules, safety guardrails, and auditability to answer three questions: *why did the payment fail, what should happen next, and can we safely automate that decision?*

> ## **Recover aggressively when it's safe. Escalate when it's uncertain.**

A payment failure should not automatically become lost revenue. It should become a reasoned, measurable, and auditable recovery opportunity.

---

# 👨‍💻 Author

**Nithin**

Built for the **Razorpay AI Buildathon 2026 — AI Revenue Recovery Track**

GitHub: **[@godabanithin18-lab](https://github.com/godabanithin18-lab)**

---

# ⭐ Project Highlights

```text
✓ Razorpay payment.failed webhook processing
✓ AI-powered failure reasoning
✓ Failure-specific recovery strategies
✓ Structured AI output validation
✓ Deterministic business-rule enforcement
✓ Confidence threshold
✓ Risk-aware human escalation
✓ Webhook signature verification
✓ Idempotency protection
✓ Retry limits
✓ Simulated recovery execution with measured outcomes
✓ Measured revenue recovery (₹31,326 / 11.3% of failed value)
✓ Complete audit trail
✓ Reproducible batch testing
✓ Cost-aware AI architecture
✓ Production queue architecture
✓ Revenue recovery measurement strategy
✓ Honest prototype scope
```

### Built around one principle:

**Don't just detect failed payments.**

**Understand them. Decide what to do next. Do it safely. And explain every decision.**