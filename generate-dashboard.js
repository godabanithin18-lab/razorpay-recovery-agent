// generate-dashboard.js
// Reads audit-log.json and generates a polished, professional HTML dashboard:
// headline metrics (including money recovered), action breakdown donut,
// confidence distribution, execution outcomes, and a recent-decisions table.
// Run: node generate-dashboard.js, then open dashboard.html

const fs = require('fs');

const LOG_FILE = './audit-log.json';
const OUTPUT_FILE = './dashboard.html';

if (!fs.existsSync(LOG_FILE)) {
  console.log('No audit-log.json found yet — run batch-test.js first.');
  process.exit(1);
}

const logs = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
const total = logs.length;

const ACTION_LABELS = {
  auto_retry: 'Auto retry',
  auto_retry_delayed: 'Auto retry (delayed)',
  send_reminder_delay: 'Reminder later',
  suggest_alternate_method: 'Alternate method',
  escalate_to_human: 'Escalated to human',
};
const ACTION_COLORS = {
  auto_retry: '#10b981',
  auto_retry_delayed: '#059669',
  send_reminder_delay: '#3b82f6',
  suggest_alternate_method: '#f59e0b',
  escalate_to_human: '#ef4444',
};

const counts = {};
for (const entry of logs) {
  counts[entry.action_taken] = (counts[entry.action_taken] || 0) + 1;
}

const autoRecoverable = ['auto_retry', 'auto_retry_delayed', 'send_reminder_delay', 'suggest_alternate_method'];
const autoCount = logs.filter(e => autoRecoverable.includes(e.action_taken)).length;
const escalatedCount = logs.filter(e => e.action_taken === 'escalate_to_human').length;
const autoPct = ((autoCount / total) * 100).toFixed(1);
const escPct = ((escalatedCount / total) * 100).toFixed(1);

const totalAtRisk = logs.reduce((sum, e) => sum + (e.amount || 0), 0) / 100;
const totalRecovered = logs.reduce((sum, e) => sum + (e.amount_recovered || 0), 0) / 100;
const recoveredCount = logs.filter(e => e.execution_outcome === 'recovered').length;
const notRecoveredCount = logs.filter(e => e.execution_outcome === 'not_recovered').length;
const pendingCount = logs.filter(e => e.execution_outcome === 'pending_human_review').length;
const recoveryPct = totalAtRisk > 0 ? ((totalRecovered / totalAtRisk) * 100).toFixed(1) : '0.0';

const confidences = logs.filter(e => typeof e.confidence === 'number').map(e => e.confidence);
const avgConfidence = confidences.length
  ? (confidences.reduce((s, c) => s + c, 0) / confidences.length).toFixed(1)
  : 'N/A';

const buckets = { '0-50': 0, '51-70': 0, '71-85': 0, '86-100': 0 };
confidences.forEach(c => {
  if (c <= 50) buckets['0-50']++;
  else if (c <= 70) buckets['51-70']++;
  else if (c <= 85) buckets['71-85']++;
  else buckets['86-100']++;
});

const labels = Object.keys(counts);
const dataValues = Object.values(counts);
const donutColors = labels.map(l => ACTION_COLORS[l] || '#888');

const outcomeCounts = { recovered: recoveredCount, not_recovered: notRecoveredCount, pending_human_review: pendingCount };
const OUTCOME_LABELS = { recovered: 'Recovered', not_recovered: 'Not recovered', pending_human_review: 'Pending review' };
const OUTCOME_COLORS = { recovered: '#10b981', not_recovered: '#94a3b8', pending_human_review: '#f59e0b' };

const recent = logs.slice(-10).reverse();

// Detect cases where the safety layer overrode the AI's own suggestion —
// these are the most compelling proof points that validation isn't decorative.
const interventions = logs.filter(e =>
  e.reasoning && (
    e.reasoning.includes("isn't a permitted action") ||
    e.reasoning.includes('Low AI confidence') ||
    e.reasoning.includes('already retried') ||
    e.reasoning.includes('failed validation')
  )
).slice(-3);

const interventionsHtml = interventions.length ? interventions.map((e, i) => `
  <div class="intervention-card">
    <div class="intervention-header">
      <span class="intervention-badge">🛡️ SAFETY OVERRIDE</span>
      <span class="mono" style="font-size:11px">${e.payment_id}</span>
    </div>
    <div class="intervention-body">
      <div class="intervention-row"><span class="i-label">Failure reason</span><span>${e.failure_reason}</span></div>
      <div class="intervention-row"><span class="i-label">Final action</span><span class="pill" style="background:${(ACTION_COLORS[e.action_taken]||'#888')}18;color:${ACTION_COLORS[e.action_taken]||'#888'}">${ACTION_LABELS[e.action_taken] || e.action_taken}</span></div>
      <div class="intervention-reason">"${e.reasoning}"</div>
    </div>
  </div>
`).join('') : '<p style="color:var(--text-faint);font-size:13px;">No safety overrides in this batch — all AI decisions passed validation cleanly.</p>';
const rowsHtml = recent.map((e, i) => {
  const conf = e.confidence ?? null;
  const confColor = conf === null ? '#94a3b8' : conf >= 85 ? '#059669' : conf >= 70 ? '#b45309' : '#b91c1c';
  const outcome = e.execution_outcome;
  const outcomeColor = OUTCOME_COLORS[outcome] || '#94a3b8';
  const outcomeLabel = OUTCOME_LABELS[outcome] || '—';
  const riskLevel = e.risk_level || 'unknown';
  return `
  <tr class="clickable-row" onclick="showDetail(${i})">
    <td class="mono">${e.payment_id}</td>
    <td class="amt">₹${(e.amount / 100).toFixed(2)}</td>
    <td>${e.failure_reason}</td>
    <td><span class="pill" style="background:${(ACTION_COLORS[e.action_taken] || '#888')}18;color:${ACTION_COLORS[e.action_taken] || '#888'}">${ACTION_LABELS[e.action_taken] || e.action_taken}</span></td>
    <td><span class="pill" style="background:${outcomeColor}18;color:${outcomeColor}">${outcomeLabel}</span></td>
    <td style="color:${confColor};font-weight:700">${conf !== null ? conf + '%' : '—'}</td>
  </tr>`;
}).join('');

const detailData = recent.map(e => ({
  payment_id: e.payment_id,
  amount: (e.amount / 100).toFixed(2),
  failure_reason: e.failure_reason,
  action_taken: ACTION_LABELS[e.action_taken] || e.action_taken,
  action_color: ACTION_COLORS[e.action_taken] || '#888',
  reasoning: e.reasoning,
  confidence: e.confidence ?? '—',
  risk_level: e.risk_level || 'unknown',
  execution_outcome: OUTCOME_LABELS[e.execution_outcome] || '—',
  amount_recovered: e.amount_recovered ? (e.amount_recovered / 100).toFixed(2) : '0.00',
  timestamp: e.timestamp,
}));

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Payment Recovery Agent — Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #0b0d12;
    --panel: #12151c;
    --panel-border: #1f2430;
    --text: #e8eaef;
    --text-dim: #8b93a7;
    --text-faint: #565f75;
    --accent: #10b981;
    --accent-glow: rgba(16, 185, 129, 0.35);
    --blue: #3b82f6;
    --amber: #f59e0b;
    --red: #ef4444;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background:
      radial-gradient(circle at 15% 0%, rgba(16,185,129,0.08), transparent 40%),
      radial-gradient(circle at 85% 15%, rgba(59,130,246,0.06), transparent 40%),
      var(--bg);
    color: var(--text);
    padding: 2.5rem 3rem 4rem;
    max-width: 1180px;
    margin: 0 auto;
    min-height: 100vh;
  }

  @keyframes fadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
  @keyframes pulseRing { 0%,100% { box-shadow: 0 0 0 0 var(--accent-glow); } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,0); } }
  @keyframes countUp { from { opacity: 0; transform: scale(0.85); } to { opacity: 1; transform: scale(1); } }

  .header {
    display: flex; justify-content: space-between; align-items: center;
    margin-bottom: 2.5rem; padding-bottom: 1.5rem;
    border-bottom: 1px solid var(--panel-border);
    animation: fadeUp 0.5s ease both;
  }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand-icon {
    width: 40px; height: 40px; border-radius: 11px;
    background: linear-gradient(135deg, var(--accent), #059669);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; box-shadow: 0 4px 20px rgba(16,185,129,0.3);
  }
  h1 { font-size: 19px; font-weight: 700; margin: 0; letter-spacing: -0.3px; }
  .subtitle { color: var(--text-dim); font-size: 13px; margin: 2px 0 0; }
  .badge {
    display: flex; align-items: center; gap: 7px;
    background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25);
    color: var(--accent); font-size: 12px; font-weight: 600;
    padding: 7px 14px; border-radius: 30px;
  }
  .badge .dot-live { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); animation: pulseRing 1.8s ease-in-out infinite; }

  .hero-metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 1.5rem; }
  .metric-card {
    background: linear-gradient(180deg, var(--panel), #0e1016);
    border: 1px solid var(--panel-border); border-radius: 16px;
    padding: 1.4rem 1.5rem; position: relative; overflow: hidden;
    transition: transform 0.25s cubic-bezier(.2,.8,.2,1), border-color 0.25s ease, box-shadow 0.25s ease;
    animation: fadeUp 0.6s ease both;
  }
  .hero-metrics .metric-card:nth-child(1) { animation-delay: 0.05s; }
  .hero-metrics .metric-card:nth-child(2) { animation-delay: 0.1s; }
  .hero-metrics .metric-card:nth-child(3) { animation-delay: 0.15s; }
  .hero-metrics .metric-card:nth-child(4) { animation-delay: 0.2s; }
  .metric-card:hover { transform: translateY(-5px); border-color: var(--card-glow, var(--accent)); box-shadow: 0 16px 40px rgba(0,0,0,0.4), 0 0 0 1px var(--card-glow, var(--accent)); }
  .metric-card::before {
    content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
    background: var(--card-glow, var(--accent)); opacity: 0; transition: opacity 0.25s ease;
  }
  .metric-card:hover::before { opacity: 1; }
  .metric-card .icon-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .metric-card .mini-icon {
    width: 32px; height: 32px; border-radius: 9px; display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--card-glow, var(--accent)) 15%, transparent);
    font-size: 15px;
  }
  .metric-card .label { font-size: 12px; color: var(--text-dim); font-weight: 500; margin-bottom: 6px; }
  .metric-card .value { font-size: 30px; font-weight: 800; letter-spacing: -1px; animation: countUp 0.5s ease 0.3s both; }
  .metric-card .delta { font-size: 11px; color: var(--text-faint); margin-top: 6px; font-weight: 500; }
  .metric-card.recovered { --card-glow: var(--accent); }
  .metric-card.recovered .value { color: var(--accent); }
  .metric-card.auto { --card-glow: var(--blue); }
  .metric-card.auto .value { color: var(--blue); }
  .metric-card.escalated { --card-glow: var(--amber); }
  .metric-card.escalated .value { color: var(--amber); }
  .metric-card.confidence .value { color: var(--text); }

  .revenue-bar-wrap {
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 16px;
    padding: 1.5rem 1.75rem; margin-bottom: 1.75rem;
    animation: fadeUp 0.6s ease 0.22s both;
  }
  .revenue-bar-header { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 14px; }
  .revenue-bar-header h3 { font-size: 13px; font-weight: 600; color: var(--text-dim); margin: 0; text-transform: uppercase; letter-spacing: 0.5px; }
  .revenue-bar-header .pct { font-size: 22px; font-weight: 800; color: var(--accent); }
  .revenue-track { height: 12px; background: #1a1e28; border-radius: 20px; overflow: hidden; position: relative; }
  .revenue-fill {
    height: 100%; border-radius: 20px;
    background: linear-gradient(90deg, #059669, var(--accent), #34d399);
    background-size: 200% 100%;
    animation: shimmer 2.5s linear infinite, growBar 1.2s cubic-bezier(.2,.8,.2,1) both 0.4s;
    position: relative;
  }
  @keyframes growBar { from { width: 0; } }
  .revenue-labels { display: flex; justify-content: space-between; margin-top: 10px; font-size: 12px; color: var(--text-dim); }
  .revenue-labels b { color: var(--text); }

  .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 1.75rem; }
  .panel {
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 16px;
    padding: 1.6rem; transition: border-color 0.25s ease, box-shadow 0.25s ease;
    animation: fadeUp 0.6s ease 0.3s both;
  }
  .panel:hover { border-color: #2a3040; box-shadow: 0 12px 32px rgba(0,0,0,0.35); }
  .panel h2 { font-size: 13px; font-weight: 600; margin: 0 0 1.1rem; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; }
  .legend { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 1.1rem; }
  .legend span {
    display: flex; align-items: center; gap: 6px; color: var(--text-dim); font-size: 12px;
    padding: 5px 10px; border-radius: 20px; background: #171b24; transition: background 0.15s ease, color 0.15s ease;
    cursor: default;
  }
  .legend span:hover { background: #1e2330; color: var(--text); }
  .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 11px 12px; border-bottom: 1px solid var(--panel-border); }
  th { color: var(--text-faint); font-weight: 600; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.6px; }
  tbody tr { transition: background 0.15s ease; }
  tbody tr:hover { background: rgba(255,255,255,0.02); }
  .mono { font-family: 'JetBrains Mono', monospace; font-size: 11.5px; color: var(--text-faint); }
  .amt { font-family: 'JetBrains Mono', monospace; font-weight: 500; }
  .pill { padding: 4px 11px; border-radius: 20px; font-size: 11.5px; font-weight: 700; transition: transform 0.15s ease; display: inline-block; }
  tr:hover .pill { transform: scale(1.05); }
  h2.section { font-size: 15px; font-weight: 700; margin: 2rem 0 1rem; animation: fadeUp 0.6s ease 0.35s both; }
  .table-wrap { animation: fadeUp 0.6s ease 0.4s both; overflow-x: auto; }

  .footer-note { text-align: center; color: var(--text-faint); font-size: 11.5px; margin-top: 2.5rem; animation: fadeUp 0.6s ease 0.5s both; }

  .interventions-wrap { display: grid; gap: 12px; margin-bottom: 0.5rem; animation: fadeUp 0.6s ease 0.32s both; }
  .intervention-card {
    background: linear-gradient(180deg, rgba(239,68,68,0.06), var(--panel));
    border: 1px solid rgba(239,68,68,0.25); border-radius: 14px; padding: 1.1rem 1.3rem;
    transition: border-color 0.2s ease, transform 0.2s ease;
  }
  .intervention-card:hover { border-color: rgba(239,68,68,0.5); transform: translateX(3px); }
  .intervention-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
  .intervention-badge { font-size: 11px; font-weight: 700; color: var(--red); background: rgba(239,68,68,0.12); padding: 4px 10px; border-radius: 20px; letter-spacing: 0.4px; }
  .intervention-row { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: var(--text-dim); margin-bottom: 6px; }
  .i-label { color: var(--text-faint); }
  .intervention-reason { font-size: 12.5px; color: var(--text); font-style: italic; margin-top: 8px; line-height: 1.5; border-left: 2px solid rgba(239,68,68,0.4); padding-left: 10px; }

  .clickable-row { cursor: pointer; }
  .clickable-row:hover td:first-child { color: var(--accent); }

  .detail-overlay {
    position: fixed; inset: 0; background: rgba(5,6,9,0.75); backdrop-filter: blur(4px);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; pointer-events: none; transition: opacity 0.2s ease; z-index: 100;
  }
  .detail-overlay.open { opacity: 1; pointer-events: auto; }
  .detail-modal {
    background: var(--panel); border: 1px solid var(--panel-border); border-radius: 18px;
    width: min(520px, 90vw); max-height: 85vh; overflow-y: auto;
    box-shadow: 0 30px 80px rgba(0,0,0,0.5);
    transform: scale(0.96); transition: transform 0.2s ease;
  }
  .detail-overlay.open .detail-modal { transform: scale(1); }
  .detail-modal-header { display: flex; justify-content: space-between; align-items: center; padding: 1.3rem 1.5rem; border-bottom: 1px solid var(--panel-border); }
  .detail-modal-header h3 { margin: 0; font-size: 15px; font-weight: 700; }
  .close-btn { background: #1a1e28; border: none; color: var(--text-dim); width: 28px; height: 28px; border-radius: 8px; cursor: pointer; font-size: 13px; transition: background 0.15s ease, color 0.15s ease; }
  .close-btn:hover { background: #262b38; color: var(--text); }
  .detail-modal-body { padding: 1.5rem; }
  .detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 20px; }
  .d-label { font-size: 10.5px; color: var(--text-faint); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .d-mono { font-family: 'JetBrains Mono', monospace; font-size: 12px; margin-top: 3px; color: var(--text); }
  .d-value { font-size: 14px; margin-top: 3px; font-weight: 600; }
  .d-section { margin-top: 16px; }
  .d-reasoning { font-size: 13px; color: var(--text); line-height: 1.6; margin-top: 8px; font-style: italic; background: #171b24; padding: 12px 14px; border-radius: 10px; border-left: 3px solid var(--accent); }

  .roi-panel { animation: fadeUp 0.6s ease 0.42s both; }
  .roi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 1.5rem; }
  .roi-input-group label { display: block; margin-bottom: 8px; }
  .roi-input {
    width: 100%; background: #171b24; border: 1px solid var(--panel-border); border-radius: 10px;
    padding: 10px 12px; color: var(--text); font-size: 15px; font-weight: 600;
    font-family: 'JetBrains Mono', monospace; transition: border-color 0.15s ease;
  }
  .roi-input:focus { outline: none; border-color: var(--accent); }
  .roi-results {
    display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
    padding-top: 1.4rem; border-top: 1px solid var(--panel-border);
  }
  .roi-result-card { background: #171b24; border-radius: 12px; padding: 1rem 1.1rem; }
  .roi-result-card .label { font-size: 11.5px; color: var(--text-faint); margin-bottom: 6px; font-weight: 500; }
  .roi-result-card .value { font-size: 22px; font-weight: 800; }
  .roi-result-card.highlight { background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.03)); border: 1px solid rgba(16,185,129,0.3); }
  .roi-result-card.highlight .value { color: var(--accent); }
</style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <div class="brand-icon">₹</div>
      <div>
        <h1>Payment Recovery Agent</h1>
        <p class="subtitle">${total} failed payments analyzed · AI-powered decision layer</p>
      </div>
    </div>
    <span class="badge"><span class="dot-live"></span> Live results</span>
  </div>

  <div class="hero-metrics">
    <div class="metric-card recovered">
      <div class="icon-row"><div class="mini-icon">💰</div></div>
      <div class="label">Revenue recovered</div>
      <div class="value">₹${totalRecovered.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
      <div class="delta">of ₹${totalAtRisk.toLocaleString('en-IN', { maximumFractionDigits: 0 })} at risk</div>
    </div>
    <div class="metric-card auto">
      <div class="icon-row"><div class="mini-icon">⚡</div></div>
      <div class="label">Handled automatically</div>
      <div class="value">${autoPct}%</div>
      <div class="delta">${autoCount} of ${total} payments</div>
    </div>
    <div class="metric-card escalated">
      <div class="icon-row"><div class="mini-icon">👤</div></div>
      <div class="label">Escalated to human</div>
      <div class="value">${escPct}%</div>
      <div class="delta">${escalatedCount} of ${total} payments</div>
    </div>
    <div class="metric-card confidence">
      <div class="icon-row"><div class="mini-icon">🎯</div></div>
      <div class="label">Avg. AI confidence</div>
      <div class="value">${avgConfidence}%</div>
      <div class="delta">across all decisions</div>
    </div>
  </div>

  <div class="revenue-bar-wrap">
    <div class="revenue-bar-header">
      <h3>Revenue recovery rate</h3>
      <span class="pct">${recoveryPct}%</span>
    </div>
    <div class="revenue-track"><div class="revenue-fill" style="width:${recoveryPct}%"></div></div>
    <div class="revenue-labels">
      <span><b>₹${totalRecovered.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b> recovered</span>
      <span><b>₹${totalAtRisk.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</b> total failed value</span>
    </div>
  </div>

  <div class="grid2">
    <div class="panel">
      <h2>Action breakdown</h2>
      <canvas id="donut" height="210"></canvas>
      <div class="legend" id="legend"></div>
    </div>
    <div class="panel">
      <h2>Execution outcomes</h2>
      <canvas id="outcomeChart" height="210"></canvas>
      <div class="legend" id="legend2"></div>
    </div>
  </div>

  <div class="panel" style="margin-bottom: 1.75rem;">
    <h2>AI confidence distribution</h2>
    <canvas id="confChart" height="90"></canvas>
  </div>

  <h2 class="section">🛡️ Safety interventions</h2>
  <p style="color:var(--text-dim);font-size:12.5px;margin:-0.5rem 0 1rem;">Cases where deterministic validation overrode the AI's own suggestion — proof the safety layer is active, not decorative.</p>
  <div class="interventions-wrap">
    ${interventionsHtml}
  </div>

  <h2 class="section">Recent decisions <span style="font-weight:400;color:var(--text-faint);font-size:12px;">(click a row for full reasoning)</span></h2>
  <div class="panel table-wrap" style="padding: 0.5rem 1.6rem 1rem;">
    <table>
      <tr><th>Payment ID</th><th>Amount</th><th>Failure reason</th><th>Action</th><th>Outcome</th><th>Confidence</th></tr>
      ${rowsHtml}
    </table>
  </div>

  <h2 class="section">💰 Merchant ROI calculator</h2>
  <div class="panel roi-panel">
    <div class="roi-grid">
      <div class="roi-input-group">
        <label class="d-label">Monthly transactions</label>
        <input type="number" id="roiTxns" value="10000" class="roi-input">
      </div>
      <div class="roi-input-group">
        <label class="d-label">Failure rate (%)</label>
        <input type="number" id="roiFailRate" value="5" step="0.1" class="roi-input">
      </div>
      <div class="roi-input-group">
        <label class="d-label">Average order value (₹)</label>
        <input type="number" id="roiAOV" value="1000" class="roi-input">
      </div>
      <div class="roi-input-group">
        <label class="d-label">Recovery rate (%)</label>
        <input type="number" id="roiRecoveryRate" value="11.3" step="0.1" class="roi-input">
      </div>
    </div>
    <div class="roi-results" id="roiResults"></div>
  </div>

  <div id="detailOverlay" class="detail-overlay" onclick="if(event.target===this)closeDetail()">
    <div class="detail-modal">
      <div class="detail-modal-header">
        <h3>Decision detail</h3>
        <button onclick="closeDetail()" class="close-btn">✕</button>
      </div>
      <div id="detailBody" class="detail-modal-body"></div>
    </div>
  </div>

  <p class="footer-note">Generated from audit-log.json · Simulated execution outcomes · Payment Recovery Agent</p>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
  <script>
    const decisionData = ${JSON.stringify(detailData)};

    function showDetail(i) {
      const d = decisionData[i];
      const body = document.getElementById('detailBody');
      body.innerHTML = \`
        <div class="detail-grid">
          <div><span class="d-label">Payment ID</span><div class="d-mono">\${d.payment_id}</div></div>
          <div><span class="d-label">Amount</span><div class="d-value">₹\${d.amount}</div></div>
          <div><span class="d-label">Failure reason</span><div class="d-value">\${d.failure_reason}</div></div>
          <div><span class="d-label">Risk level</span><div class="d-value" style="text-transform:capitalize">\${d.risk_level}</div></div>
        </div>
        <div class="d-section">
          <span class="d-label">AI decision</span>
          <div style="margin-top:6px"><span class="pill" style="background:\${d.action_color}18;color:\${d.action_color};font-size:13px;padding:6px 14px">\${d.action_taken}</span></div>
        </div>
        <div class="d-section">
          <span class="d-label">Reasoning</span>
          <p class="d-reasoning">"\${d.reasoning}"</p>
        </div>
        <div class="detail-grid" style="margin-top:14px">
          <div><span class="d-label">Confidence</span><div class="d-value">\${d.confidence}%</div></div>
          <div><span class="d-label">Execution outcome</span><div class="d-value">\${d.execution_outcome}</div></div>
          <div><span class="d-label">Amount recovered</span><div class="d-value" style="color:var(--accent)">₹\${d.amount_recovered}</div></div>
          <div><span class="d-label">Timestamp</span><div class="d-value" style="font-size:11px">\${new Date(d.timestamp).toLocaleString()}</div></div>
        </div>
      \`;
      document.getElementById('detailOverlay').classList.add('open');
    }
    function closeDetail() {
      document.getElementById('detailOverlay').classList.remove('open');
    }

    function calcROI() {
      const txns = parseFloat(document.getElementById('roiTxns').value) || 0;
      const failRate = (parseFloat(document.getElementById('roiFailRate').value) || 0) / 100;
      const aov = parseFloat(document.getElementById('roiAOV').value) || 0;
      const recoveryRate = (parseFloat(document.getElementById('roiRecoveryRate').value) || 0) / 100;

      const failedPayments = Math.round(txns * failRate);
      const recoveredPayments = Math.round(failedPayments * recoveryRate);
      const recoveredRevenue = recoveredPayments * aov;
      const aiCostPerDecision = 0.025; // ~₹0.025 per decision, based on Groq pricing
      const monthlyAiCost = failedPayments * aiCostPerDecision;
      const roi = monthlyAiCost > 0 ? (recoveredRevenue / monthlyAiCost).toFixed(0) : '—';

      const fmt = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

      document.getElementById('roiResults').innerHTML = \`
        <div class="roi-result-card">
          <div class="label">Failed payments / month</div>
          <div class="value">\${failedPayments.toLocaleString('en-IN')}</div>
        </div>
        <div class="roi-result-card">
          <div class="label">Recovered payments</div>
          <div class="value">\${recoveredPayments.toLocaleString('en-IN')}</div>
        </div>
        <div class="roi-result-card highlight">
          <div class="label">Recovered revenue / month</div>
          <div class="value">\${fmt(recoveredRevenue)}</div>
        </div>
        <div class="roi-result-card">
          <div class="label">AI decisioning cost / month</div>
          <div class="value" style="font-size:16px">\${fmt(monthlyAiCost)}</div>
        </div>
        <div class="roi-result-card">
          <div class="label">Return on AI cost</div>
          <div class="value" style="font-size:16px">\${roi}×</div>
        </div>
        <div class="roi-result-card">
          <div class="label">Based on</div>
          <div class="value" style="font-size:12px;font-weight:500;color:var(--text-dim)">This agent's ${recoveryPct}% measured rate*</div>
        </div>
      \`;
    }

    ['roiTxns','roiFailRate','roiAOV','roiRecoveryRate'].forEach(id => {
      document.getElementById(id).addEventListener('input', calcROI);
    });
    calcROI();

    Chart.defaults.color = '#8b93a7';
    Chart.defaults.font.family = 'Inter';

    const labels = ${JSON.stringify(labels.map(l => ACTION_LABELS[l] || l))};
    const colors = ${JSON.stringify(donutColors)};

    new Chart(document.getElementById('donut'), {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: ${JSON.stringify(dataValues)}, backgroundColor: colors, borderWidth: 3, borderColor: '#12151c', hoverOffset: 12, hoverBorderColor: '#12151c' }]
      },
      options: {
        responsive: true,
        cutout: '68%',
        animation: { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#1a1e28', padding: 11, cornerRadius: 10, titleFont: { weight: '600' }, boxPadding: 6 }
        }
      }
    });

    const legendEl = document.getElementById('legend');
    labels.forEach((l, i) => {
      const el = document.createElement('span');
      el.innerHTML = '<span class="dot" style="background:' + colors[i] + '"></span>' + l;
      legendEl.appendChild(el);
    });

    const outcomeLabels = ${JSON.stringify(Object.keys(outcomeCounts).map(k => OUTCOME_LABELS[k]))};
    const outcomeColors = ${JSON.stringify(Object.keys(outcomeCounts).map(k => OUTCOME_COLORS[k]))};
    const outcomeData = ${JSON.stringify(Object.values(outcomeCounts))};

    new Chart(document.getElementById('outcomeChart'), {
      type: 'doughnut',
      data: {
        labels: outcomeLabels,
        datasets: [{ data: outcomeData, backgroundColor: outcomeColors, borderWidth: 3, borderColor: '#12151c', hoverOffset: 12, hoverBorderColor: '#12151c' }]
      },
      options: {
        responsive: true,
        cutout: '68%',
        animation: { animateRotate: true, animateScale: true, duration: 1000, easing: 'easeOutQuart', delay: 150 },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: '#1a1e28', padding: 11, cornerRadius: 10, titleFont: { weight: '600' }, boxPadding: 6 }
        }
      }
    });

    const legendEl2 = document.getElementById('legend2');
    outcomeLabels.forEach((l, i) => {
      const el = document.createElement('span');
      el.innerHTML = '<span class="dot" style="background:' + outcomeColors[i] + '"></span>' + l;
      legendEl2.appendChild(el);
    });

    new Chart(document.getElementById('confChart'), {
      type: 'bar',
      data: {
        labels: ${JSON.stringify(Object.keys(buckets))},
        datasets: [{
          label: 'Payments',
          data: ${JSON.stringify(Object.values(buckets))},
          backgroundColor: 'rgba(16,185,129,0.55)',
          hoverBackgroundColor: '#10b981',
          borderRadius: 8,
          maxBarThickness: 60,
        }]
      },
      options: {
        responsive: true,
        animation: { duration: 900, easing: 'easeOutQuart', delay: 250 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1a1e28', padding: 11, cornerRadius: 10 } },
        scales: {
          y: { beginAtZero: true, ticks: { stepSize: 1 }, grid: { color: '#1a1e28' } },
          x: { grid: { display: false } }
        }
      }
    });
  </script>
</body>
</html>`;

fs.writeFileSync(OUTPUT_FILE, html);
console.log(`Dashboard generated: ${OUTPUT_FILE}`);
console.log('Open it by double-clicking the file, or right-click → Open with browser.');