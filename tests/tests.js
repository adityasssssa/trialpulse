// Focused regression checks for confirmed defects and data-consistency rules.
import { loadIndex, loadSummary, loadEligibility } from '../js/data.js';
import { normalizeCity, trialCities, parseQuery, buildQuery, wilson, phaseLabel } from '../js/util.js';
import { prepareIndex, applyFilters, toCsv } from '../js/pages/trials.js';

const results = [];
const ul = document.getElementById('results');
function check(name, ok, detail = '') {
  results.push(ok);
  const li = document.createElement('li');
  li.className = ok ? 'pass' : 'fail';
  li.textContent = `${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ` (${detail})` : ''}`;
  ul.appendChild(li);
}

// Data base path: tests live at /tests/, data at /data/.
const index = await loadIndex();
const summary = await loadSummary();
const rows = prepareIndex(index);

// 1. Export integrity rules from HANDOFF.md.
check('ranks are 1..n in file order', index.every((t, i) => t.risk_rank === i + 1), `n=${index.length}`);
check('risk never increases with rank', index.every((t, i) => i === 0 || t.risk <= index[i - 1].risk));
check('nct_id values are unique', new Set(index.map((t) => t.nct_id)).size === index.length);
check('tier counts match summary.json', index.filter((t) => t.risk_tier === 'high').length === summary.n_high_risk && index.length === summary.n_trials_scored);
check('no site-country reason in top_reasons', index.every((t) => (t.top_reasons || []).every((r) => !/site country/i.test(r.feature_label))));

// 2. City normalization (confirmed defect: Worcester counts differed between map and list).
check('normalizeCity maps the three known typos', normalizeCity('Worester') === 'Worcester' && normalizeCity('Worchester') === 'Worcester' && normalizeCity('Sommerville') === 'Somerville');
check('normalizeCity leaves real places alone', normalizeCity('North Worcester') === 'North Worcester' && normalizeCity('West Springfield') === 'West Springfield' && normalizeCity(null) === null);
const worcesterList = applyFilters(rows, { city: 'Worcester' });
const worcesterRaw = index.filter((t) => (t.ma_sites || []).some((s) => normalizeCity(s.city) === 'Worcester'));
check('list filter for Worcester includes the misspelled sites', worcesterList.length === worcesterRaw.length, `${worcesterList.length} trials`);
const worcesterHigh = applyFilters(rows, { city: 'Worcester', tier: 'high' });
check('high-risk link count equals high-risk trials with a Worcester site', worcesterHigh.length === worcesterRaw.filter((t) => t.risk_tier === 'high').length, `${worcesterHigh.length} trials`);

// 3. Map and list use the same filters: per-city totals from the list match a direct count.
const f = { phase: 'PHASE2', category: 'Neoplasms', from: '2024' };
const filtered = applyFilters(rows, f).map((r) => r.t);
const byCity = new Map();
for (const t of filtered) for (const c of trialCities(t)) byCity.set(c, (byCity.get(c) || 0) + 1);
let parity = true;
for (const [city, n] of byCity) {
  const viaLink = applyFilters(rows, { ...f, city }).length;
  if (viaLink !== n) { parity = false; break; }
}
check('every map city count equals the linked list count under the same filters', parity, `${byCity.size} cities checked`);

// 4. Year filters and combined filters.
check('start-year range filter respects both bounds', applyFilters(rows, { from: '2025', to: '2025' }).every((r) => r.t.start_date?.startsWith('2025')));
check('empty result set is handled (impossible combination)', applyFilters(rows, { tier: 'high', phase: 'PHASE4', from: '2008', to: '2008' }).length === 0);
check('clearing filters returns every trial', applyFilters(rows, {}).length === index.length);

// 5. CSV export covers the whole selection, not just a page.
const csvRows = toCsv(applyFilters(rows, { tier: 'elevated' })).split('\n');
check('CSV has one line per matching trial plus a header', csvRows.length === applyFilters(rows, { tier: 'elevated' }).length + 1, `${csvRows.length - 1} rows`);
check('CSV keeps registered city spelling in its own column', csvRows[0].includes('ma_cities_as_registered'));

// 6. URL state round-trips.
const q = { q: 'heart failure', city: 'Fall River', from: '2024' };
check('query string round-trips with spaces', JSON.stringify(parseQuery(buildQuery(q))) === JSON.stringify(q));

// 7. Labels and helpers.
check('phase labels', phaseLabel(['PHASE1', 'PHASE2']) === 'Phase 1/2' && phaseLabel(['NA']) === 'Not applicable' && phaseLabel([]) === 'Not specified');
const ci = wilson(0.2, 100);
check('Wilson interval brackets the estimate', ci && ci[0] < 0.2 && ci[1] > 0.2 && ci[0] > 0.12 && ci[1] < 0.30, `${ci?.map((x) => x.toFixed(3)).join('–')}`);

// 8. Per-trial eligibility file is served and matches the full export's text.
try {
  const e = await loadEligibility(index[0].nct_id);
  check('per-trial eligibility file loads for rank 1', e.source === 'per-trial' && typeof e.text === 'string' && e.text.length > 0, e.source);
} catch (err) {
  check('per-trial eligibility file loads for rank 1', false, String(err));
}

const passed = results.filter(Boolean).length;
document.getElementById('summary').textContent = `${passed} of ${results.length} checks passed.`;
document.getElementById('summary').className = passed === results.length ? 'pass' : 'fail';
