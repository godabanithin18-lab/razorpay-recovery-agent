// summarize.js
// Reads audit-log.json and produces summary stats:
// how many failures fell into each action category,
// and what % were "auto-recoverable without human involvement"

const fs = require('fs');

const LOG_FILE = './audit-log.json';

if (!fs.existsSync(LOG_FILE)) {
  console.log('No audit-log.json found yet — run batch-test.js first.');
  process.exit(1);
}

const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));

const counts = {};
for (const entry of logs) {
  counts[entry.action_taken] = (counts[entry.action_taken] || 0) + 1;
}

const total = logs.length;

console.log(`\n=== Recovery Agent Summary (${total} payments processed) ===\n`);

for (const [action, count] of Object.entries(counts)) {
  const pct = ((count / total) * 100).toFixed(1);
  console.log(`${action.padEnd(28)} ${count.toString().padStart(3)}  (${pct}%)`);
}

// Define which actions count as "auto-recoverable without human involvement"
const autoRecoverable = ['auto_retry', 'auto_retry_delayed', 'send_reminder_delay', 'suggest_alternate_method'];
const autoCount = logs.filter(e => autoRecoverable.includes(e.action_taken)).length;
const escalatedCount = logs.filter(e => e.action_taken === 'escalate_to_human').length;

console.log(`\n--- Headline metric for pitch ---`);
console.log(`${autoCount}/${total} (${((autoCount/total)*100).toFixed(1)}%) failures handled automatically without human involvement`);
console.log(`${escalatedCount}/${total} (${((escalatedCount/total)*100).toFixed(1)}%) correctly escalated for human review (unclear/risky cases)`);
console.log('');