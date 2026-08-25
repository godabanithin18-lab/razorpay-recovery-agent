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
const rowsHtml = recent.map(e => {
  const conf = e.confidence ?? null;
  const confColor = conf === null ? '#94a3b8' : conf >= 85 ? '#059669' : conf >= 70 ? '#b45309' : '#b91c1c';
  const outcome = e.execution_outcome;
  const outcomeColor = OUTCOME_COLORS[outcome] || '#94a3b8';
  const outcomeLabel = OUTCOME_LABELS[outcome] || '—';
  return `
  <tr>
    <td class="mono">${e.payment_id}</td>
    <td class="amt">₹${(e.amount / 100).toFixed(2)}</td>
    <td>${e.failure_reason}</td>
    <td><span class="pill" style="background:${(ACTION_COLORS[e.action_taken] || '#888')}18;color:${ACTION_COLORS[e.action_taken] || '#888'}">${ACTION_LABELS[e.action_taken] || e.action_taken}</span></td>
    <td><span class="pill" style="background:${outcomeColor}18;color:${outcomeColor}">${outcomeLabel}</span></td>
    <td style="color:${confColor};font-weight:700">${conf !== null ? conf + '%' : '—'}</td>
  </tr>`;
}).join('');

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

  <h2 class="section">Recent decisions</h2>
  <div class="panel table-wrap" style="padding: 0.5rem 1.6rem 1rem;">
    <table>
      <tr><th>Payment ID</th><th>Amount</th><th>Failure reason</th><th>Action</th><th>Outcome</th><th>Confidence</th></tr>
      ${rowsHtml}
    </table>
  </div>

  <p class="footer-note">Generated from audit-log.json · Simulated execution outcomes · Payment Recovery Agent</p>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"></script>
  <script>
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