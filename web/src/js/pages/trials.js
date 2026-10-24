import { loadIndex, loadSummary } from '../data.js';
import { softNavigate } from '../app.js';
import {
  esc, fmtInt, fmtPct, fmtTimes, tierBadge, sourceLine, phaseLabel, phaseKey, sponsorLabel,
  norm, parseQuery, buildQuery, siteSummary, TIER_LABELS, TIER_ORDER,
} from '../util.js';
import { phaseWithInfo, infoButton } from '../info.js';

const PAGE = 50;
let prepared = null; // index rows with precomputed search text

function prepare(rows) {
  return rows.map((t) => ({
    t,
    search: norm([t.title, t.nct_id, ...(t.conditions || [])].join(' | ')),
    facilities: norm((t.ma_sites || []).map((s) => `${s.facility || ''} ${s.city || ''}`).join(' | ')),
    cities: new Set((t.ma_sites || []).map((s) => s.city).filter(Boolean)),
    phase: phaseKey(t.phases),
  }));
}

function options(rows) {
  const cats = new Map();
  const phases = new Map();
  const sponsors = new Map();
  const cities = new Map();
  for (const r of rows) {
    for (const c of r.t.condition_categories || []) cats.set(c, (cats.get(c) || 0) + 1);
    phases.set(r.phase, (phases.get(r.phase) || 0) + 1);
    const sp = r.t.sponsor_class || 'UNSPECIFIED';
    sponsors.set(sp, (sponsors.get(sp) || 0) + 1);
    for (const c of r.cities) cities.set(c, (cities.get(c) || 0) + 1);
  }
  const byCount = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const phaseOrder = ['EARLY_PHASE1', 'PHASE1', 'PHASE1+PHASE2', 'PHASE2', 'PHASE2+PHASE3', 'PHASE3', 'PHASE4', 'NA', 'UNSPECIFIED'];
  const phaseList = [...phases.entries()].sort((a, b) => {
    const ia = phaseOrder.indexOf(a[0]); const ib = phaseOrder.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return { cats: byCount(cats), phases: phaseList, sponsors: byCount(sponsors), cities: byCount(cities) };
}

function applyFilters(rows, f) {
  const q = norm(f.q || '').trim();
  const fac = norm(f.facility || '').trim();
  return rows.filter((r) => {
    const t = r.t;
    if (f.tier && t.risk_tier !== f.tier) return false;
    if (f.category) {
      if (f.category === '__none__') { if ((t.condition_categories || []).length) return false; }
      else if (!(t.condition_categories || []).includes(f.category)) return false;
    }
    if (f.phase && r.phase !== f.phase) return false;
    if (f.sponsor && (t.sponsor_class || 'UNSPECIFIED') !== f.sponsor) return false;
    if (f.city && !r.cities.has(f.city)) return false;
    if (fac && !r.facilities.includes(fac)) return false;
    if (q && !r.search.includes(q)) return false;
    return true;
  });
}

function rowHtml(t, maxRisk) {
  const sites = siteSummary(t, 2);
  const conds = (t.conditions || []).slice(0, 3).join(', ');
  const width = Math.max(2, Math.round((t.risk / maxRisk) * 100));
  return `<tr>
    <td class="rank">${t.risk_rank}</td>
    <td class="title-cell">
      <a href="#/trial/${esc(t.nct_id)}">${esc(t.title)}</a>
      <div class="sub">${esc(t.nct_id)}${conds ? ' · ' + esc(conds) : ''}${(t.conditions || []).length > 3 ? ', …' : ''}</div>
    </td>
    <td data-label="Tier">${tierBadge(t.risk_tier)}</td>
    <td class="risk-cell" data-label="Risk">
      <span class="times">${fmtTimes(t.risk_vs_typical)} typical</span>
      <span class="pct">${fmtPct(t.risk)} estimated risk</span>
      <span class="risk-bar tier-${esc(t.risk_tier)}" aria-hidden="true"><span style="width:${width}%"></span></span>
    </td>
    <td data-label="Phase">${phaseWithInfo(t.phases)}</td>
    <td data-label="Sponsor">${esc(sponsorLabel(t.sponsor_class))}</td>
    <td class="sites-cell" data-label="MA sites">${sites.shown.map(esc).join('<br>')}${sites.more ? `<br><span class="muted">+${sites.more} more</span>` : ''}</td>
  </tr>`;
}

function selectHtml(id, label, items, value, labelFn = (k) => k, allLabel = 'All', extra = '') {
  return `<div class="field">
    <div class="label-row"><label for="${id}">${label}</label>${extra}</div>
    <select id="${id}" name="${id}">
      <option value="">${allLabel}</option>
      ${items.map(([k, n]) => `<option value="${esc(k)}" ${k === value ? 'selected' : ''}>${esc(labelFn(k))} (${fmtInt(n)})</option>`).join('')}
    </select>
  </div>`;
}

export async function render(main, { query }) {
  document.title = 'Ranked trials · TrialPulse';
  const [index, summary] = await Promise.all([loadIndex(), loadSummary()]);
  if (!prepared) prepared = prepare(index);
  const f = parseQuery(query);
  const opts = options(prepared);
  const maxRisk = index[0]?.risk || 1;

  const tierCounts = new Map();
  for (const r of prepared) tierCounts.set(r.t.risk_tier, (tierCounts.get(r.t.risk_tier) || 0) + 1);

  const matches = applyFilters(prepared, f);
  const anyFilter = ['q', 'tier', 'category', 'phase', 'sponsor', 'city', 'facility'].some((k) => f[k]);

  // Build the page skeleton once; re-render only the results on filter changes.
  if (!main.querySelector('#trials-page')) {
    main.innerHTML = `
      <div id="trials-page">
        <div class="page-head">
          <h1>Ranked trials</h1>
          <p>All ${fmtInt(index.length)} trials now recruiting in Massachusetts, riskiest first. Risk means the estimated chance a trial stops early because too few people join. It is an estimate, not a certainty.</p>
        </div>
        <form class="filters" id="filters" role="search" aria-label="Filter trials">
          <div class="search-row">
            <div class="field search">
              <label for="q">Search title, condition or NCT ID</label>
              <input type="search" id="q" name="q" placeholder="e.g. lymphoma, NCT06510309, heart failure" value="${esc(f.q || '')}" autocomplete="off">
            </div>
            <button type="button" class="btn btn-secondary filters-toggle" id="filters-toggle" aria-expanded="false" aria-controls="filters-grid">Filters</button>
          </div>
          <div class="filters-grid" id="filters-grid">
            ${selectHtml('tier', 'Risk tier', TIER_ORDER.map((t) => [t, tierCounts.get(t) || 0]), f.tier || '', (k) => TIER_LABELS[k], 'All tiers')}
            ${selectHtml('category', 'Condition category', [...opts.cats, ['__none__', prepared.filter((r) => !(r.t.condition_categories || []).length).length]], f.category || '', (k) => (k === '__none__' ? 'No MeSH category listed' : k), 'All categories')}
            ${selectHtml('phase', 'Phase', opts.phases, f.phase || '', (k) => phaseLabel(k === 'UNSPECIFIED' ? [] : k.split('+')), 'All phases', infoButton('ALL', 'What the trial phases mean'))}
            ${selectHtml('sponsor', 'Sponsor type', opts.sponsors, f.sponsor || '', (k) => (k === 'UNSPECIFIED' ? 'Not specified' : sponsorLabel(k)), 'All sponsor types')}
            ${selectHtml('city', 'City', opts.cities, f.city || '', (k) => k, 'All cities')}
            <div class="field">
              <label for="facility">Facility</label>
              <input type="text" id="facility" name="facility" list="facility-list" placeholder="e.g. Mass General" value="${esc(f.facility || '')}" autocomplete="off">
              <datalist id="facility-list"></datalist>
            </div>
          </div>
          <div class="filters-bar">
            <p class="result-count" id="result-count" aria-live="polite"></p>
            <button type="button" class="link-btn" id="clear-filters">Clear filters</button>
          </div>
        </form>
        <div id="results"></div>
        ${sourceLine(summary, 'High risk = top 10% of the ranking, elevated = next 20%, typical = the rest. "× typical" compares a trial with the typical (median) trial.')}
      </div>`;

    // Facility suggestions (distinct facility names, most common first).
    const facCounts = new Map();
    for (const r of prepared) for (const s of r.t.ma_sites || []) if (s.facility) facCounts.set(s.facility, (facCounts.get(s.facility) || 0) + 1);
    const dl = main.querySelector('#facility-list');
    dl.innerHTML = [...facCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([k]) => `<option value="${esc(k)}"></option>`).join('');

    const form = main.querySelector('#filters');
    const toggle = main.querySelector('#filters-toggle');
    toggle.addEventListener('click', () => {
      const open = form.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    const update = () => {
      const data = new FormData(form);
      const next = {};
      for (const [k, v] of data.entries()) next[k] = String(v).trim();
      softNavigate(`#/trials${buildQuery(next) ? '?' + buildQuery(next) : ''}`);
    };
    let timer = null;
    form.addEventListener('input', (e) => {
      clearTimeout(timer);
      const delay = e.target.tagName === 'SELECT' ? 0 : 180;
      timer = setTimeout(update, delay);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); update(); });
    main.querySelector('#clear-filters').addEventListener('click', () => {
      form.reset();
      form.querySelectorAll('input').forEach((i) => { i.value = ''; });
      form.querySelectorAll('select').forEach((s) => { s.value = ''; });
      softNavigate('#/trials');
    });
  } else {
    // Keep form controls in sync when navigating via browser back/forward.
    const form = main.querySelector('#filters');
    for (const k of ['q', 'tier', 'category', 'phase', 'sponsor', 'city', 'facility']) {
      const el = form.elements[k];
      if (el && document.activeElement !== el) el.value = f[k] || '';
    }
  }

  const activeFilters = ['tier', 'category', 'phase', 'sponsor', 'city', 'facility'].filter((k) => f[k]).length;
  const toggleBtn = main.querySelector('#filters-toggle');
  toggleBtn.textContent = activeFilters ? `Filters (${activeFilters})` : 'Filters';
  toggleBtn.setAttribute('aria-label', activeFilters ? `Show filters, ${activeFilters} active` : 'Show filters');
  const count = main.querySelector('#result-count');
  count.textContent = anyFilter
    ? `${fmtInt(matches.length)} of ${fmtInt(index.length)} trials match`
    : `All ${fmtInt(index.length)} trials`;

  const results = main.querySelector('#results');
  if (!matches.length) {
    results.innerHTML = `<div class="card empty">No trials match these filters. <button type="button" class="link-btn" id="clear-inline">Clear filters</button></div>`;
    results.querySelector('#clear-inline').addEventListener('click', () => main.querySelector('#clear-filters').click());
    return;
  }

  let shown = Math.min(PAGE, matches.length);
  const draw = () => {
    results.innerHTML = `
      <div class="table-wrap card" style="padding:0">
        <table class="data trials-table">
          <caption class="visually-hidden">Recruiting Massachusetts trials ranked by estimated risk of enrollment-related early termination</caption>
          <thead><tr>
            <th scope="col">Rank</th><th scope="col">Trial</th><th scope="col">Risk tier</th><th scope="col">Risk</th><th scope="col">Phase</th><th scope="col">Sponsor</th><th scope="col">Massachusetts site(s)</th>
          </tr></thead>
          <tbody>${matches.slice(0, shown).map((r) => rowHtml(r.t, maxRisk)).join('')}</tbody>
        </table>
      </div>
      <div class="show-more">
        ${shown < matches.length
          ? `<p class="muted small">Showing ${fmtInt(shown)} of ${fmtInt(matches.length)}</p><button type="button" class="btn btn-secondary" id="show-more">Show ${fmtInt(Math.min(PAGE * 4, matches.length - shown))} more</button>`
          : `<p class="muted small">Showing all ${fmtInt(matches.length)} matching trials</p>`}
      </div>`;
    const btn = results.querySelector('#show-more');
    if (btn) btn.addEventListener('click', () => {
      const firstNew = shown;
      shown = Math.min(shown + PAGE * 4, matches.length);
      draw();
      const row = results.querySelectorAll('tbody tr')[firstNew];
      if (row) { const a = row.querySelector('a'); if (a) a.focus({ preventScroll: true }); row.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    });
  };
  draw();
}
