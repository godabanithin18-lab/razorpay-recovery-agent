// safety-layer-demo.js
// A standalone unit test of the deterministic safety validation logic —
// deliberately feeds it both safe AND unsafe hypothetical AI outputs to
// prove the guardrail works independently of what the live LLM actually
// says. This is the same validation logic used in index.js.
//
// Run: node safety-layer-demo.js (no server or network needed)

const VALID_ACTIONS = ['auto_retry', 'auto_retry_delayed', 'send_reminder_delay', 'suggest_alternate_method', 'escalate_to_human'];

const ALLOWED_ACTIONS_BY_REASON = {
  insufficient_funds: ['send_reminder_delay', 'escalate_to_human'],
  card_declined: ['suggest_alternate_method', 'escalate_to_human'],
  network_error: ['auto_retry', 'escalate_to_human'],
  bank_server_down: ['auto_retry_delayed', 'escalate_to_human'],
};

function validate(reasonCode, aiSuggestedAction, aiConfidence) {
  if (!VALID_ACTIONS.includes(aiSuggestedAction)) {
    return { passed: false, finalAction: 'escalate_to_human', why: `"${aiSuggestedAction}" is not a recognized action at all` };
  }
  const allowed = ALLOWED_ACTIONS_BY_REASON[reasonCode];
  if (allowed && !allowed.includes(aiSuggestedAction)) {
    return { passed: false, finalAction: 'escalate_to_human', why: `"${aiSuggestedAction}" is not a permitted action for "${reasonCode}"` };
  }
  if (aiConfidence < 70) {
    return { passed: false, finalAction: 'escalate_to_human', why: `AI confidence (${aiConfidence}%) is below the 70% safety threshold` };
  }
  return { passed: true, finalAction: aiSuggestedAction, why: 'AI suggestion satisfies all safety checks' };
}

const scenarios = [
  {
    label: 'CASE 1 — A correct, safe AI suggestion',
    reason: 'insufficient_funds',
    suggested: 'send_reminder_delay',
    confidence: 91,
  },
  {
    label: 'CASE 2 — An UNSAFE AI suggestion (hypothetical): auto-retrying insufficient funds',
    reason: 'insufficient_funds',
    suggested: 'auto_retry',
    confidence: 94,
  },
  {
    label: 'CASE 3 — An UNSAFE AI suggestion (hypothetical): low confidence acted on anyway',
    reason: 'network_error',
    suggested: 'auto_retry',
    confidence: 52,
  },
];

console.log('═══════════════════════════════════════════════════════');
console.log(' SAFETY LAYER — DETERMINISTIC VALIDATION DEMO');
console.log(' (Runs offline — tests the guardrail logic directly,');
console.log('  independent of any live AI response)');
console.log('═══════════════════════════════════════════════════════\n');

for (const s of scenarios) {
  console.log(`▶ ${s.label}`);
  console.log(`  Failure reason:     ${s.reason}`);
  console.log(`  AI suggested:       ${s.suggested}  (confidence: ${s.confidence}%)`);
  const result = validate(s.reason, s.suggested, s.confidence);
  console.log(`  Safety check:       ${result.passed ? '✅ PASSED' : '❌ BLOCKED'}`);
  console.log(`  Reason:             ${result.why}`);
  console.log(`  Final action taken: ${result.finalAction}`);
  console.log('');
}

console.log('───────────────────────────────────────────────────────');
console.log('The takeaway: a wrong or unsafe AI suggestion cannot');
console.log('directly cause a financial action. The safety layer');
console.log('decides what is actually allowed to happen — not the AI.');
console.log('───────────────────────────────────────────────────────');