import { loadIndex, loadSummary } from '../data.js?v=20261025142715';
import { softNavigate } from '../app.js?v=20261025142715';
import {
  esc, fmtInt, fmtPct, fmtTimes, tierBadge, sourceLine, phaseLabel, phaseKey, sponsorLabel,
  norm, parseQuery, buildQuery, siteSummary, TIER_LABELS, TIER_ORDER, normalizeCity, trialCities, startYear,
} from '../util.js?v=20261025142715';
import { phaseWithInfo, infoButton } from '../info.js?v=20261025142715';

const PAGE = 50;
const FILTER_KEYS = ['q', 'tier', 'category', 'phase', 'sponsor', 'city', 'facility', 'from', 'to'];
let prepared = null; // index rows with precomputed search text

const SORTS = {
  rank: { label: 'Highest risk first', fn: (a, b) => a.t.risk_rank - b.t.risk_rank },
  start_desc: { label: 'Newest start date first', fn: (a, b) => (b.t.start_date || '').localeCompare(a.t.start_date || '') || a.t.risk_rank - b.t.risk_rank },
  start_asc: { label: 'Oldest start date first', fn: (a, b) => (a.t.start_date || '').localeCompare(b.t.start_date || '') || a.t.risk_rank - b.t.risk_rank },
  ma_sites: { label: 'Most Massachusetts sites first', fn: (a, b) => b.t.n_ma_sites - a.t.n_ma_sites || a.t.risk_rank - b.t.risk_rank },
  title: { label: 'Title, A to Z', fn: (a, b) => a.t.title.localeCompare(b.t.title) },
};

function prepare(rows) {
  return rows.map((t) => ({
    t,
    search: norm([t.title, t.nct_id, ...(t.conditions || [])].join(' | ')),
    facilities: norm((t.ma_sites || []).map((s) => `${s.facility || ''} ${normalizeCity(s.city) || ''} ${s.city || ''}`).join(' | ')),
    cities: new Set(trialCities(t)),
    phase: phaseKey(t.phases),
    year: startYear(t),
  }));
}

function options(rows) {
  const cats = new Map(); const phases = new Map(); const sponsors = new Map(); const cities = new Map(); const years = new Set();
  for (const r of rows) {
    for (const c of r.t.condition_categories || []) cats.set(c, (cats.get(c) || 0) + 1);
    phases.set(r.phase, (phases.get(r.phase) || 0) + 1);
    const sp = r.t.sponsor_class || 'UNSPECIFIED';
    sponsors.set(sp, (sponsors.get(sp) || 0) + 1);
    for (const c of r.cities) cities.set(c, (cities.get(c) || 0) + 1);
    if (r.year) years.add(r.year);
  }
  const byCount = (m) => [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const phaseOrder = ['EARLY_PHASE1', 'PHASE1', 'PHASE1+PHASE2', 'PHASE2', 'PHASE2+PHASE3', 'PHASE3', 'PHASE4', 'NA', 'UNSPECIFIED'];
  const phaseList = [...phases.entries()].sort((a, b) => {
    const ia = phaseOrder.indexOf(a[0]); const ib = phaseOrder.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return { cats: byCount(cats), phases: phaseList, sponsors: byCount(sponsors), cities: byCount(cities), years: [...years].sort() };
}

// Shared with the map page so that counts and links always agree.
export function applyFilters(rows, f) {
  const q = norm(f.q || '').trim();
  const fac = norm(f.facility || '').trim();
  const from = f.from ? Number(f.from) : null;
  const to = f.to ? Number(f.to) : null;
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
    if (from != null && (r.year == null || r.year < from)) return false;
    if (to != null && (r.year == null || r.year > to)) return false;
    if (fac && !r.facilities.includes(fac)) return false;
    if (q && !r.search.includes(q)) return false;
    return true;
  });
}

export function prepareIndex(index) {
  if (!prepared) prepared = prepare(index);
  return prepared;
}

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV of the full current selection (every matching row, not only the rows shown).
export function toCsv(rows) {
  const head = ['nct_id', 'risk_rank', 'risk_tier', 'risk', 'risk_vs_typical', 'title', 'phases', 'sponsor_class', 'conditions', 'condition_categories', 'start_date', 'n_sites', 'n_ma_sites', 'ma_facilities', 'ma_cities', 'ma_cities_as_registered', 'url'];
  const lines = [head.join(',')];
  for (const r of rows) {
    const t = r.t;
    lines.push([
      t.nct_id, t.risk_rank, t.risk_tier, t.risk, t.risk_vs_typical, t.title, (t.phases || []).join('; '), t.sponsor_class,
      (t.conditions || []).join('; '), (t.condition_categories || []).join('; '), t.start_date, t.n_sites, t.n_ma_sites,
      (t.ma_sites || []).map((s) => s.facility || '').join('; '), trialCities(t).join('; '),
      [...new Set((t.ma_sites || []).map((s) => s.city || ''))].join('; '), t.url,
    ].map(csvCell).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(rows, summary) {
  const blob = new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `trialpulse-review-list-${summary?.data_pulled || 'export'}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
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
    <td class="risk-cell" data-label="Relative risk">
      <span class="times">${fmtTimes(t.risk_vs_typical)} typical</span>
      <span class="pct">${fmtPct(t.risk)} estimated</span>
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

// Human-readable description of each active filter, for the chips row.
function chipLabel(key, value) {
  switch (key) {
    case 'q': return `Search: “${value}”`;
    case 'tier': return TIER_LABELS[value] || value;
    case 'category': return value === '__none__' ? 'No MeSH category' : value;
    case 'phase': return phaseLabel(value === 'UNSPECIFIED' ? [] : value.split('+'));
    case 'sponsor': return value === 'UNSPECIFIED' ? 'Sponsor not specified' : sponsorLabel(value);
    case 'city': return `City: ${value}`;
    case 'facility': return `Facility: ${value}`;
    case 'from': return `Started ${value} or later`;
    case 'to': return `Started ${value} or earlier`;
    default: return `${key}: ${value}`;
  }
}

export async function render(main, { query }) {
  document.title = 'Ranked trials · TrialPulse';
  const [index, summary] = await Promise.all([loadIndex(), loadSummary()]);
  prepareIndex(index);
  const f = parseQuery(query);
  const opts = options(prepared);
  const maxRisk = index[0]?.risk || 1;

  const tierCounts = new Map();
  for (const r of prepared) tierCounts.set(r.t.risk_tier, (tierCounts.get(r.t.risk_tier) || 0) + 1);

  const sortKey = SORTS[f.sort] ? f.sort : 'rank';
  const matches = applyFilters(prepared, f).sort(SORTS[sortKey].fn);
  main._matches = matches;
  const active = FILTER_KEYS.filter((k) => f[k]);
  const anyFilter = active.length > 0;

  if (!main.querySelector('#trials-page')) {
    main.innerHTML = `
      <div id="trials-page">
        <div class="page-head">
          <h1>Ranked trials</h1>
          <p>All ${fmtInt(index.length)} trials now recruiting in Massachusetts, ranked by their estimated risk of stopping early because too few people join. The tier and the "× typical" figure show relative priority; the percentage is a model estimate, not a measured rate. ${infoButton('TIER', 'What the risk tiers and “× typical” mean')}</p>
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
              <div class="label-row"><label for="facility">Facility</label></div>
              <input type="text" id="facility" name="facility" list="facility-list" placeholder="e.g. Mass General" value="${esc(f.facility || '')}" autocomplete="off">
              <datalist id="facility-list"></datalist>
            </div>
            <div class="field"><div class="label-row"><label for="from">Start year from</label></div><select id="from" name="from"><option value="">Any year</option>${opts.years.map((y) => `<option value="${y}" ${String(y) === f.from ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <div class="field"><div class="label-row"><label for="to">Start year to</label></div><select id="to" name="to"><option value="">Any year</option>${opts.years.map((y) => `<option value="${y}" ${String(y) === f.to ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          </div>
          <div class="chips" id="active-chips" aria-label="Active filters"></div>
          <div class="filters-bar">
            <p class="result-count" id="result-count" aria-live="polite"></p>
            <div class="bar-actions">
              <label class="sort-label" for="sort">Sort</label>
              <select id="sort" name="sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${k === sortKey ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select>
              <button type="button" class="btn btn-secondary btn-small" id="download-csv" title="Every trial in the current selection, not only the rows shown">Download review list (CSV)</button>
              <button type="button" class="btn btn-secondary btn-small" id="copy-link">Copy link</button>
              <button type="button" class="link-btn" id="clear-filters">Clear filters</button>
            </div>
          </div>
        </form>
        <div id="results"></div>
        ${sourceLine(summary, 'Scores were computed from this snapshot. High risk = top 10% of the ranking, elevated = next 20%, typical = the rest. "× typical" = estimated risk divided by the median estimated risk of all scored trials.')}
      </div>`;

    const facCounts = new Map();
    for (const r of prepared) for (const s of r.t.ma_sites || []) if (s.facility) facCounts.set(s.facility, (facCounts.get(s.facility) || 0) + 1);
    main.querySelector('#facility-list').innerHTML = [...facCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 300).map(([k]) => `<option value="${esc(k)}"></option>`).join('');

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
      if (next.sort === 'rank') delete next.sort;
      softNavigate(`#/trials${buildQuery(next) ? '?' + buildQuery(next) : ''}`);
    };
    let timer = null;
    form.addEventListener('input', (e) => {
      clearTimeout(timer);
      const delay = e.target.tagName === 'SELECT' ? 0 : 180;
      timer = setTimeout(update, delay);
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); update(); });
    main.querySelector('#download-csv').addEventListener('click', () => downloadCsv(main._matches || [], summary));
    main.querySelector('#copy-link').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      try { await navigator.clipboard.writeText(location.href); btn.textContent = 'Link copied'; } catch (err) { btn.textContent = 'Copy failed'; }
      setTimeout(() => { btn.textContent = 'Copy link'; }, 1600);
    });
    main.querySelector('#clear-filters').addEventListener('click', () => {
      form.reset();
      form.querySelectorAll('input').forEach((i) => { i.value = ''; });
      form.querySelectorAll('select').forEach((s) => { s.value = s.id === 'sort' ? 'rank' : ''; });
      softNavigate('#/trials');
    });
    main.querySelector('#active-chips').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove]');
      if (!btn) return;
      const next = parseQuery((location.hash.split('?')[1] || ''));
      delete next[btn.dataset.remove];
      const el = form.elements[btn.dataset.remove];
      if (el) el.value = btn.dataset.remove === 'sort' ? 'rank' : '';
      softNavigate(`#/trials${buildQuery(next) ? '?' + buildQuery(next) : ''}`);
    });
  } else {
    const form = main.querySelector('#filters');
    for (const k of [...FILTER_KEYS, 'sort']) {
      const el = form.elements[k];
      if (el && document.activeElement !== el) el.value = f[k] || (k === 'sort' ? 'rank' : '');
    }
  }

  const activeFilters = active.filter((k) => k !== 'q').length;
  const toggleBtn = main.querySelector('#filters-toggle');
  toggleBtn.textContent = activeFilters ? `Filters (${activeFilters})` : 'Filters';
  toggleBtn.setAttribute('aria-label', activeFilters ? `Show filters, ${activeFilters} active` : 'Show filters');

  main.querySelector('#active-chips').innerHTML = active.map((k) => `<span class="chip">${esc(chipLabel(k, f[k]))} <button type="button" class="chip-x" data-remove="${k}" aria-label="Remove filter: ${esc(chipLabel(k, f[k]))}">×</button></span>`).join('');

  const count = main.querySelector('#result-count');
  count.textContent = (anyFilter
    ? `${fmtInt(matches.length)} of ${fmtInt(index.length)} trials match`
    : `All ${fmtInt(index.length)} trials`) + (sortKey !== 'rank' ? ` · ${SORTS[sortKey].label}` : '');

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
            <th scope="col">Rank</th><th scope="col">Trial</th><th scope="col">Risk tier</th><th scope="col">Relative risk</th><th scope="col">Phase</th><th scope="col">Sponsor</th><th scope="col">Massachusetts site(s)</th>
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
