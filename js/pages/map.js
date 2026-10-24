import { loadIndex, loadSummary } from '../data.js?v=20261024234430';
import { loadLeaflet, addTiles } from '../leaflet.js?v=20261024234430';
import { softNavigate } from '../app.js?v=20261024234430';
import { esc, fmtInt, fmtPct, sourceLine, phaseLabel, phaseKey, sponsorLabel, parseQuery, buildQuery } from '../util.js?v=20261024234430';

// Massachusetts bounding box (south-west, north-east) with a little padding.
const MA_BOUNDS = [[41.15, -73.65], [43.0, -69.8]];

const METRICS = {
  high: { label: 'High-risk trials', bins: [
    { min: 0, max: 0, label: 'None', color: '#f1e9e3' },
    { min: 1, max: 1, label: '1', color: '#fcbba1' },
    { min: 2, max: 3, label: '2–3', color: '#fb6a4a' },
    { min: 4, max: 9, label: '4–9', color: '#cb181d' },
    { min: 10, max: Infinity, label: '10 or more', color: '#67000d' },
  ], value: (c) => c.high, text: (c) => `${fmtInt(c.high)} high-risk of ${fmtInt(c.total)} trials` },
  share: { label: 'Share of trials that are high risk', bins: [
    { min: 0, max: 0, label: '0%', color: '#f1e9e3' },
    { min: 0.0001, max: 0.05, label: 'Under 5%', color: '#fcbba1' },
    { min: 0.05, max: 0.1, label: '5–10%', color: '#fb6a4a' },
    { min: 0.1, max: 0.2, label: '10–20%', color: '#cb181d' },
    { min: 0.2, max: Infinity, label: 'Over 20%', color: '#67000d' },
  ], value: (c) => c.share, text: (c) => `${fmtPct(c.share)} high risk (${fmtInt(c.high)} of ${fmtInt(c.total)})` },
  all: { label: 'All matching trials', bins: [
    { min: 1, max: 1, label: '1', color: '#dbe9f3' },
    { min: 2, max: 9, label: '2–9', color: '#a9c1d4' },
    { min: 10, max: 49, label: '10–49', color: '#6a9ac0' },
    { min: 50, max: 199, label: '50–199', color: '#2d5571' },
    { min: 200, max: Infinity, label: '200 or more', color: '#14314a' },
  ], value: (c) => c.total, text: (c) => `${fmtInt(c.total)} trials, ${fmtInt(c.high)} high risk` },
};

const binFor = (bins, v) => bins.find((b) => v >= b.min && v <= b.max) || bins[bins.length - 1];
const year = (t) => (t.start_date ? Number(t.start_date.slice(0, 4)) : null);

function applyFilters(index, f) {
  const from = f.from ? Number(f.from) : null;
  const to = f.to ? Number(f.to) : null;
  return index.filter((t) => {
    if (f.phase && phaseKey(t.phases) !== f.phase) return false;
    if (f.category && !(t.condition_categories || []).includes(f.category)) return false;
    if (f.sponsor && (t.sponsor_class || 'UNSPECIFIED') !== f.sponsor) return false;
    const y = year(t);
    if (from != null && (y == null || y < from)) return false;
    if (to != null && (y == null || y > to)) return false;
    return true;
  });
}

// One row per city for the current trial set.
function aggregate(trials, coords) {
  const cities = new Map();
  for (const t of trials) {
    const seen = new Set();
    for (const s of t.ma_sites || []) {
      if (!s.city || seen.has(s.city)) continue;
      seen.add(s.city);
      if (!cities.has(s.city)) cities.set(s.city, { city: s.city, total: 0, high: 0, latest: null, ...(coords.get(s.city) || { lat: null, lon: null }) });
      const c = cities.get(s.city);
      c.total += 1;
      if (t.risk_tier === 'high') c.high += 1;
      if (t.start_date && (!c.latest || t.start_date > c.latest)) c.latest = t.start_date;
    }
  }
  return [...cities.values()].map((c) => ({ ...c, share: c.total ? c.high / c.total : 0 }));
}

function sortRows(rows, key, dir) {
  const m = dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (key === 'city') return m * a.city.localeCompare(b.city);
    const d = (a[key] ?? -1) - (b[key] ?? -1);
    return d ? m * d : b.total - a.total || a.city.localeCompare(b.city);
  });
}

function optionList(items, value, labelFn, allLabel) {
  return `<option value="">${allLabel}</option>${items.map(([k, n]) => `<option value="${esc(k)}" ${k === value ? 'selected' : ''}>${esc(labelFn(k))} (${fmtInt(n)})</option>`).join('')}`;
}

function yearChart(trials, f) {
  const counts = new Map();
  for (const t of trials) { const y = year(t); if (y) counts.set(y, (counts.get(y) || 0) + 1); }
  const years = [...counts.keys()].sort();
  if (!years.length) return '<p class="muted small">No start dates in this selection.</p>';
  const max = Math.max(...counts.values());
  const w = 760; const h = 150; const left = 36; const bottom = 24; const bw = (w - left - 8) / years.length;
  const bars = years.map((y, i) => {
    const n = counts.get(y); const bh = Math.max(2, (n / max) * (h - bottom - 18));
    const x = left + i * bw; const yTop = h - bottom - bh;
    const active = (!f.from || y >= Number(f.from)) && (!f.to || y <= Number(f.to));
    return `<g class="yc-bar ${active ? '' : 'dim'}" data-year="${y}" tabindex="0" role="button" aria-label="${y}: ${fmtInt(n)} trials. Press to show only this year">
      <rect x="${(x + 1).toFixed(1)}" y="${yTop.toFixed(1)}" width="${Math.max(2, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2"></rect>
      <text class="val" x="${(x + bw / 2).toFixed(1)}" y="${(yTop - 4).toFixed(1)}" text-anchor="middle">${n}</text>
      ${years.length <= 14 || i % 2 === 0 ? `<text class="lbl" x="${(x + bw / 2).toFixed(1)}" y="${h - 6}" text-anchor="middle">${y}</text>` : ''}
    </g>`;
  }).join('');
  return `<svg class="year-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Matching trials by start year, ${years[0]} to ${years[years.length - 1]}">${bars}</svg>`;
}

export async function render(main, { query }) {
  document.title = 'Map · TrialPulse';
  const [index, summary] = await Promise.all([loadIndex(), loadSummary()]);
  const f = parseQuery(query);
  const metric = METRICS[f.metric] ? f.metric : 'high';
  const sortKey = ['city', 'total', 'high', 'share', 'latest'].includes(f.sort) ? f.sort : 'high';
  const sortDir = f.dir === 'asc' ? 'asc' : 'desc';

  // Static option lists and city coordinates come from the full index.
  const coords = new Map();
  const phases = new Map(); const cats = new Map(); const sponsors = new Map(); const years = new Set();
  for (const t of index) {
    for (const s of t.ma_sites || []) if (s.city && s.lat != null && !coords.has(s.city)) coords.set(s.city, { lat: s.lat, lon: s.lon });
    const pk = phaseKey(t.phases); phases.set(pk, (phases.get(pk) || 0) + 1);
    for (const c of t.condition_categories || []) cats.set(c, (cats.get(c) || 0) + 1);
    const sp = t.sponsor_class || 'UNSPECIFIED'; sponsors.set(sp, (sponsors.get(sp) || 0) + 1);
    const y = year(t); if (y) years.add(y);
  }
  const phaseOrder = ['EARLY_PHASE1', 'PHASE1', 'PHASE1+PHASE2', 'PHASE2', 'PHASE2+PHASE3', 'PHASE3', 'PHASE4', 'NA', 'UNSPECIFIED'];
  const phaseList = [...phases.entries()].sort((a, b) => phaseOrder.indexOf(a[0]) - phaseOrder.indexOf(b[0]));
  const byCount = (m) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  const yearList = [...years].sort();

  const trials = applyFilters(index, f);
  const rows = aggregate(trials, coords);
  const located = rows.filter((r) => r.lat != null);
  const nHigh = trials.filter((t) => t.risk_tier === 'high').length;
  const anyFilter = ['phase', 'category', 'sponsor', 'from', 'to'].some((k) => f[k]);
  const listQuery = buildQuery({ phase: f.phase, category: f.category, sponsor: f.sponsor });

  if (!main.querySelector('#map-page')) {
    main.innerHTML = `
      <div id="map-page" class="map-page">
        <div class="page-head">
          <h1>Where the high-risk trials are</h1>
          <p>One circle per Massachusetts city with a recruiting trial site. Darker means more of the selected trials, or a larger high-risk share. Hover or tap a circle for its numbers; click through to that city's ranked list.</p>
        </div>
        <form class="filters map-filters" id="map-filters" aria-label="Filter the map">
          <div class="map-toggle-row"><button type="button" class="btn btn-secondary filters-toggle" id="map-toggle" aria-expanded="false" aria-controls="map-filters-grid">Filters</button></div>
          <div class="filters-grid" id="map-filters-grid">
            <div class="field"><label for="m-metric">Shade by</label><select id="m-metric" name="metric">
              ${Object.entries(METRICS).map(([k, m]) => `<option value="${k}" ${k === metric ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
            </select></div>
            <div class="field"><label for="m-phase">Phase</label><select id="m-phase" name="phase">${optionList(phaseList, f.phase || '', (k) => phaseLabel(k === 'UNSPECIFIED' ? [] : k.split('+')), 'All phases')}</select></div>
            <div class="field"><label for="m-category">Condition category</label><select id="m-category" name="category">${optionList(byCount(cats), f.category || '', (k) => k, 'All categories')}</select></div>
            <div class="field"><label for="m-sponsor">Sponsor type</label><select id="m-sponsor" name="sponsor">${optionList(byCount(sponsors), f.sponsor || '', (k) => (k === 'UNSPECIFIED' ? 'Not specified' : sponsorLabel(k)), 'All sponsor types')}</select></div>
            <div class="field"><label for="m-from">Started from</label><select id="m-from" name="from"><option value="">Any year</option>${yearList.map((y) => `<option value="${y}" ${String(y) === f.from ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <div class="field"><label for="m-to">Started up to</label><select id="m-to" name="to"><option value="">Any year</option>${yearList.map((y) => `<option value="${y}" ${String(y) === f.to ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
          </div>
          <div class="filters-bar">
            <p class="result-count" id="map-summary" aria-live="polite"></p>
            <button type="button" class="link-btn" id="map-clear">Clear filters</button>
          </div>
        </form>
        <div class="card map-card">
          <div class="map map-large" id="city-map" role="img" aria-label="Map of Massachusetts cities. Circle shading follows the selected measure; the table below lists the same numbers."></div>
          <div id="map-legend"></div>
          <p class="small muted" id="map-note" style="margin:10px 0 0"></p>
          ${sourceLine(summary, 'High risk = top 10% by estimated risk.')}
        </div>
        <section class="section" aria-labelledby="years-h">
          <h2 id="years-h">Matching trials by start year</h2>
          <div class="card" id="year-card"></div>
        </section>
        <section class="section" aria-labelledby="table-h">
          <h2 id="table-h">By city</h2>
          <div class="card" style="padding:0;overflow:hidden" id="city-table"></div>
          ${sourceLine(summary)}
        </section>
      </div>`;

    const form = main.querySelector('#map-filters');
    const update = () => {
      const data = new FormData(form);
      const next = { sort: f.sort, dir: f.dir };
      for (const [k, v] of data.entries()) next[k] = String(v);
      softNavigate(`#/map${buildQuery(next) ? '?' + buildQuery(next) : ''}`);
    };
    form.addEventListener('change', update);
    main.querySelector('#map-clear').addEventListener('click', () => softNavigate('#/map'));
    const toggle = main.querySelector('#map-toggle');
    toggle.addEventListener('click', () => {
      const open = form.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  } else {
    const form = main.querySelector('#map-filters');
    for (const k of ['metric', 'phase', 'category', 'sponsor', 'from', 'to']) {
      const el = form.elements[k];
      if (el && document.activeElement !== el) el.value = k === 'metric' ? metric : (f[k] || '');
    }
  }

  // Summary line and legend.
  const nActive = ['phase', 'category', 'sponsor', 'from', 'to'].filter((k) => f[k]).length;
  main.querySelector('#map-toggle').textContent = nActive ? `Filters (${nActive})` : 'Filters';
  main.querySelector('#map-summary').textContent = anyFilter
    ? `${fmtInt(trials.length)} of ${fmtInt(index.length)} trials match · ${fmtInt(nHigh)} high risk · ${fmtInt(rows.length)} cities`
    : `All ${fmtInt(index.length)} trials · ${fmtInt(nHigh)} high risk · ${fmtInt(rows.length)} cities`;
  const M = METRICS[metric];
  main.querySelector('#map-legend').innerHTML = `<ul class="map-legend" aria-label="Colour scale">${M.bins.map((b) => `<li><span class="swatch" style="background:${b.color}"></span>${esc(b.label)}</li>`).join('')}</ul>`;
  main.querySelector('#map-note').textContent = `Circle size follows the number of matching trials in the city. ${fmtInt(rows.length - located.length)} city name${rows.length - located.length === 1 ? '' : 's'} without registry coordinates appear only in the table.`;

  // Year chart.
  const yc = main.querySelector('#year-card');
  yc.innerHTML = yearChart(trials, f) + `<p class="small muted" style="margin:8px 0 0">Click a bar to show only trials that started in that year.</p>`;
  yc.querySelectorAll('.yc-bar').forEach((g) => {
    const pick = () => softNavigate(`#/map?${buildQuery({ ...f, from: g.dataset.year, to: g.dataset.year })}`);
    g.addEventListener('click', pick);
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  });

  // City table.
  const sorted = sortRows(rows, sortKey, sortDir);
  const th = (key, label, numeric) => {
    const active = key === sortKey;
    const nextDir = active && sortDir === 'desc' ? 'asc' : 'desc';
    return `<th scope="col" class="${numeric ? 'num' : ''}" aria-sort="${active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}"><a href="#/map?${buildQuery({ ...f, sort: key, dir: nextDir })}" class="sort-link">${esc(label)}${active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}</a></th>`;
  };
  main.querySelector('#city-table').innerHTML = `<div class="table-wrap"><table class="data map-table">
    <caption class="visually-hidden">Matching trials per Massachusetts city with the number and share in the high-risk tier</caption>
    <thead><tr>${th('city', 'City')}${th('total', 'Trials', true)}${th('high', 'High risk', true)}${th('share', 'Share high risk', true)}${th('latest', 'Newest start', true)}<th scope="col">Ranked list</th></tr></thead>
    <tbody>${sorted.map((r) => `<tr>
      <th scope="row">${esc(r.city)}${r.lat == null ? ' <span class="muted small">(not on map)</span>' : ''}</th>
      <td class="num">${fmtInt(r.total)}</td><td class="num">${fmtInt(r.high)}</td><td class="num">${fmtPct(r.share)}</td><td class="num">${esc(r.latest || '—')}</td>
      <td><a href="#/trials?${buildQuery({ city: r.city, ...Object.fromEntries(listQuery ? listQuery.split('&').map((p) => p.split('=').map(decodeURIComponent)) : []) })}">All</a>${r.high ? ` · <a href="#/trials?${buildQuery({ city: r.city, tier: 'high' })}">High risk</a>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;

  // Map.
  const container = main.querySelector('#city-map');
  let L;
  try { L = await loadLeaflet(); } catch (e) {
    container.className = 'error'; container.textContent = 'The map library could not be loaded. The table has the same numbers.'; return;
  }
  if (!container.isConnected) return;
  if (!container._map) {
    const map = L.map(container, { scrollWheelZoom: false, minZoom: 7, maxZoom: 13, maxBounds: MA_BOUNDS, maxBoundsViscosity: 0.9 });
    addTiles(L, map);
    map.fitBounds(MA_BOUNDS);
    container._map = map;
    container._layer = L.layerGroup().addTo(map);
  }
  const layer = container._layer;
  layer.clearLayers();
  const maxTotal = Math.max(...located.map((r) => r.total), 1);
  const radius = (total) => 6 + 24 * Math.sqrt(total / maxTotal);
  for (const r of [...located].sort((a, b) => b.total - a.total)) {
    const b = binFor(M.bins, M.value(r));
    const m = L.circleMarker([r.lat, r.lon], { radius: radius(r.total), color: '#3b2a26', weight: 1, fillColor: b.color, fillOpacity: 0.85 });
    const text = `<strong>${esc(r.city)}</strong><br>${M.text(r)}${r.latest ? `<br>Newest start: ${esc(r.latest)}` : ''}`;
    m.bindTooltip(text, { direction: 'top', opacity: 0.95 });
    m.bindPopup(`${text}<br><a href="#/trials?${buildQuery({ city: r.city, tier: r.high ? 'high' : '' })}">See ${r.high ? 'the high-risk' : 'all'} trials in ${esc(r.city)}</a>`);
    m.addTo(layer);
  }
}
