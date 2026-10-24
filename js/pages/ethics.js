import { loadSummary, loadMetrics, loadIndex } from '../data.js';
import { esc, fmtInt, fmtPct, fmtNum, sourceLine } from '../util.js';

const REPO = 'https://github.com/adityasssssa/trialpulse';

// Shares of all scored trials vs the high-risk tier, computed from the index export.
function fairnessRows(index) {
  const high = index.filter((t) => t.risk_tier === 'high');
  const share = (rows, f) => rows.filter(f).length / rows.length;
  const factors = [
    ['Academic / other sponsor', (t) => t.sponsor_class === 'OTHER'],
    ['Single site worldwide', (t) => t.n_sites === 1],
    ['Industry sponsor', (t) => t.sponsor_class === 'INDUSTRY'],
  ];
  return factors.map(([label, f]) => ({ label, all: share(index, f), high: share(high, f), nAll: index.length, nHigh: high.length }));
}

function fairnessTable(rows) {
  return `<div class="table-wrap"><table class="data fair-table">
    <caption class="visually-hidden">Share of trials with each feature, all scored trials compared with the high-risk tier</caption>
    <thead><tr><th scope="col">Feature</th><th scope="col" class="num">All ${fmtInt(rows[0].nAll)} trials</th><th scope="col" class="num">High-risk tier (${fmtInt(rows[0].nHigh)})</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td class="num">${fmtPct(r.all)}</td><td class="num">${fmtPct(r.high)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

function fairnessChart(rows) {
  const left = 230; const width = 820; const barW = width - left - 200; const rowH = 58; const top = 8;
  const h = top + rows.length * rowH + 4;
  const bars = rows.map((r, i) => {
    const y = top + i * rowH;
    const wAll = Math.max(2, r.all * barW); const wHigh = Math.max(2, r.high * barW);
    return `<g>
      <text x="${left - 10}" y="${y + 14}" text-anchor="end" font-weight="600">${esc(r.label)}</text>
      <rect class="bar bar-all" x="${left}" y="${y + 2}" width="${wAll.toFixed(1)}" height="18" rx="3"></rect>
      <text class="val" x="${left + wAll + 6}" y="${y + 16}">${fmtPct(r.all)} of all trials</text>
      <rect class="bar bar-high" x="${left}" y="${y + 26}" width="${wHigh.toFixed(1)}" height="18" rx="3"></rect>
      <text class="val" x="${left + wHigh + 6}" y="${y + 40}">${fmtPct(r.high)} of high-risk trials</text>
    </g>`;
  }).join('');
  const alt = rows.map((r) => `${r.label}: ${fmtPct(r.all)} of all trials versus ${fmtPct(r.high)} of high-risk trials`).join('. ');
  return `<svg class="bar-chart fair-chart" viewBox="0 0 ${width} ${h}" role="img" aria-label="Bar chart. High-risk trials are mostly small academic studies. ${esc(alt)}.">
    <line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${h - 4}" />
    ${bars}
  </svg>`;
}

export async function render(main) {
  document.title = 'Ethics and responsible use · TrialPulse';
  const [summary, metrics, index] = await Promise.all([loadSummary(), loadMetrics(), loadIndex()]);
  const d = metrics.default_model || { population: 'all', scheme: 'strict', model: 'lightgbm' };
  const row = (model, slice = 'all') => metrics.rows.find((r) => r.population === d.population && r.scheme === d.scheme && r.model === model && r.slice === slice);
  const main_ = row(d.model); const logreg = row('logreg'); const ma = row(d.model, 'ma');
  const hc = metrics.label_handcheck_agreement;
  const fair = fairnessRows(index);
  const src = sourceLine(summary);

  main.innerHTML = `
    <div class="ethics">
      <div class="page-head">
        <h1>Ethics and responsible use</h1>
        <p>What TrialPulse promises, what it cannot see, and how to use a score without harming anyone.</p>
      </div>

      <section class="section" aria-labelledby="promise-h">
        <div class="promise">
          <h2 id="promise-h">Our promise</h2>
          <ul>
            <li>TrialPulse ranks trials, never people.</li>
            <li>Eligibility is decided by the study team.</li>
            <li>Not medical advice.</li>
            <li>Scores are for sending more recruitment help, never for cutting a trial.</li>
          </ul>
        </div>
      </section>

      <section class="section" aria-labelledby="pred-h">
        <h2 id="pred-h">What the model predicts, and what it doesn't</h2>
        <div class="grid-2">
          <div class="card">
            <h3>It predicts</h3>
            <ul class="checks"><li>The estimated risk that a trial stops early because too few people enroll.</li></ul>
          </div>
          <div class="card">
            <h3>It does not predict</h3>
            <ul class="checks">
              <li class="no">Whether a treatment works.</li>
              <li class="no">Whether a trial is good science or will reach its goals.</li>
              <li class="no">Whether anyone can join a trial.</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="section prose" aria-labelledby="data-h">
        <h2 id="data-h">Data we use</h2>
        <ul class="checks">
          <li>Public ClinicalTrials.gov registrations only. No patient records, ever.</li>
          <li>Only facts known when a trial starts: phase, sponsor type, number of sites, eligibility rules. Never results or actual enrollment.</li>
          <li>Trained on trials that started ${metrics.train_years?.[0]}–${metrics.train_years?.[1]} and tested on trials that started ${metrics.test_years?.[0]}–${metrics.test_years?.[1]}.</li>
        </ul>
        ${src}
      </section>

      <section class="section prose" aria-labelledby="check-h">
        <h2 id="check-h">How we checked ourselves</h2>
        <ul class="checks">
          <li><strong>We hand-checked ${fmtInt(hc?.n_checked)} labels.</strong> ${fmtPct(hc?.positives_precision, 0)} of flagged trials (${esc(hc?.counts?.positives_precision)}) were confirmed as real low-enrollment stops. <a href="${REPO}/blob/main/docs/handcheck_labels.csv" rel="noopener">See the hand-check labels</a>.</li>
          <li><strong>We found a data leak and removed it.</strong> Trials registered after they had already run were giving the outcome away. Removing them dropped accuracy from 0.791 to ${fmtNum(main_?.auc_roc, 3)} AUC, and we report the lower number.</li>
          <li><strong>A simple model does nearly as well.</strong> Logistic regression scores ${fmtNum(logreg?.auc_roc, 3)} AUC against ${fmtNum(main_?.auc_roc, 3)} for our main model (LightGBM). We say so openly.</li>
        </ul>
        ${sourceLine(summary, `Test trials started ${metrics.test_years?.[0]}–${metrics.test_years?.[1]}.`)}
      </section>

      <section class="section" aria-labelledby="fair-h">
        <h2 id="fair-h">Fairness: who could be affected</h2>
        <p class="prose">High-risk trials are mostly small academic studies. A high score should bring more outreach help, never a reason to defund or close a trial.</p>
        <div class="card">
          ${fairnessChart(fair)}
          <p class="small muted chart-key"><span class="key key-all">All trials</span> <span class="key key-high">High-risk tier</span></p>
          ${fairnessTable(fair)}
          <p class="source">Source: ClinicalTrials.gov API v2, data pulled ${esc(summary.data_pulled)}. Computed from exports/ma_trials_index.json. High-risk tier = top 10% by estimated risk.</p>
        </div>
        <p class="prose" style="margin-top:14px">Scores show patterns, not causes. They never judge a research team.</p>
      </section>

      <section class="section prose" aria-labelledby="experts-h">
        <h2 id="experts-h">What experts told us</h2>
        <p class="muted">From the Ethics Genius Bar review.</p>
        <ul class="checks">
          <li><strong>Demographics.</strong> Our data does not show who enrolls (race, ethnicity, or the age of actual participants), so we cannot tell whether a trial reaches diverse groups.</li>
          <li><strong>Socio-economic factors.</strong> Travel, cost, time off work, insurance and language barriers all affect enrollment, but none of them are in our data.</li>
          <li><strong>Objectivity.</strong> We report weak results as well as strong ones, and treat scores as patterns, not proof.</li>
        </ul>
      </section>

      <section class="section" aria-labelledby="limits-h">
        <h2 id="limits-h">Known limits</h2>
        <ul class="limits">
          <li>Labels come from free-text "why stopped" reasons, so some are wrong.</li>
          <li>Lower accuracy on mental-health trials (about 0.63 AUC).</li>
          <li>Rare-disease performance cannot be evaluated: too few trials.</li>
          <li>"Main site in the US" raises scores partly because US trials report stop reasons more consistently. We never show country as a reason for a score.</li>
          <li>The Massachusetts test slice is small (${fmtInt(ma?.n_test)} trials).</li>
          <li>Recruiting trials are larger than most past trials, so treat scores as a ranking, not exact probabilities.</li>
          <li>Trials that were never registered are invisible.</li>
          <li>The model cannot see recruitment networks, protocol quality or investigator track record.</li>
        </ul>
        ${src}
        <p class="small"><a href="#/about">The full list of limits, with the numbers behind each one, is on the About page.</a></p>
      </section>

      <section class="section prose" aria-labelledby="next-h">
        <h2 id="next-h">What's next</h2>
        <ul class="checks">
          <li>Add demographics from completed trials' published results.</li>
          <li>Add community data near trial sites: the CDC Social Vulnerability Index and MassGIS environmental-justice areas.</li>
          <li>Pilot with one hospital recruitment office under a written use agreement.</li>
        </ul>
      </section>

      <section class="section prose" aria-labelledby="more-h">
        <h2 id="more-h">Learn more</h2>
        <ul class="checks">
          <li><a href="${REPO}" rel="noopener">TrialPulse code and data on GitHub</a></li>
          <li><a href="${REPO}/blob/main/HANDOFF.md" rel="noopener">Data guide and display rules (HANDOFF.md)</a></li>
          <li><a href="${REPO}/blob/main/README.md" rel="noopener">Project README with the full results table</a></li>
          <li><a href="https://clinicaltrials.gov/" rel="noopener">ClinicalTrials.gov</a></li>
        </ul>
      </section>
    </div>`;
}
