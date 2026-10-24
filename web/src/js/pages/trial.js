import { findInIndex, loadFullTrial, loadSummary, isFullLoaded } from '../data.js';
import {
  esc, fmtInt, fmtPct, fmtTimes, tierBadge, sourceLine, phaseLabel, sponsorLabel, sexLabel,
  ageRange, healthyLabel, fmtDate, TIER_LABELS,
} from '../util.js';

const LEAFLET_VERSION = '1.9.4';
const LEAFLET_JS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
const LEAFLET_CSS = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
const LEAFLET_JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const LEAFLET_CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

let leafletPromise = null;
function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = LEAFLET_CSS; css.integrity = LEAFLET_CSS_SRI; css.crossOrigin = '';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = LEAFLET_JS; js.integrity = LEAFLET_JS_SRI; js.crossOrigin = '';
      js.onload = () => resolve(window.L);
      js.onerror = () => { leafletPromise = null; reject(new Error('Map library could not be loaded')); };
      document.head.appendChild(js);
    });
  }
  return leafletPromise;
}

const extIcon = '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function reasonsHtml(reasons) {
  if (!reasons || !reasons.length) return '<p class="muted">No reasons available.</p>';
  return `<ol class="reasons">${reasons.map((r) => {
    const raises = r.direction === 'raises risk';
    return `<li class="reason">
      <span class="dir ${raises ? 'raises' : 'lowers'}">${raises ? '▲ raises risk' : '▼ lowers risk'}</span>
      <span><span class="what">${esc(r.feature_label)}</span><br><span class="val">${esc(r.plain_english)}</span></span>
    </li>`;
  }).join('')}</ol>`;
}

function sitesHtml(sites) {
  if (!sites || !sites.length) return '<p class="muted">No Massachusetts sites listed.</p>';
  return `<ul class="site-list">${sites.map((s) => `<li>
    ${esc(s.facility || 'Facility name not listed')}${s.city ? ` <span class="city">· ${esc(s.city)}, MA</span>` : ''}
    ${s.lat == null || s.lon == null ? ' <span class="muted small">(no map coordinates in the registry)</span>' : ''}
  </li>`).join('')}</ul>`;
}

async function drawMap(container, sites) {
  const located = sites.filter((s) => s.lat != null && s.lon != null);
  if (!located.length) {
    container.className = 'muted small';
    container.textContent = 'No map coordinates available for these sites.';
    return;
  }
  let L;
  try { L = await loadLeaflet(); } catch (e) {
    container.className = 'muted small';
    container.textContent = 'Map unavailable (the map library could not be loaded).';
    return;
  }
  if (!container.isConnected) return;
  const map = L.map(container, { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  // Several sites can share the same (city-level) coordinates: group them into one pin.
  const groups = new Map();
  for (const s of located) {
    const key = `${s.lat},${s.lon}`;
    if (!groups.has(key)) groups.set(key, { lat: s.lat, lon: s.lon, names: [] });
    groups.get(key).names.push(`${s.facility || 'Facility name not listed'}${s.city ? `, ${s.city}` : ''}`);
  }
  const markers = [];
  for (const g of groups.values()) {
    const m = L.circleMarker([g.lat, g.lon], { radius: 9, color: '#0f5f66', weight: 2, fillColor: '#6cc4c9', fillOpacity: 0.85 });
    m.bindPopup(g.names.map(esc).join('<br>'));
    m.addTo(map);
    markers.push(m);
  }
  const group = L.featureGroup(markers);
  map.fitBounds(group.getBounds().pad(0.4), { maxZoom: 11 });
  if (markers.length === 1) map.setView(markers[0].getLatLng(), 11);
}

function eligibilityHtml(text) {
  if (text == null) return '<p class="muted">No eligibility criteria text is listed in the registry for this trial.</p>';
  return `<pre id="elig-text" class="clamped">${esc(text)}</pre>
    <div class="toggle"><button type="button" class="btn btn-secondary btn-small" id="elig-toggle" aria-expanded="false" aria-controls="elig-text">Show full text</button></div>`;
}

export async function render(main, { params }) {
  const nctId = params[0].toUpperCase();
  const [summary, base] = await Promise.all([loadSummary(), findInIndex(nctId)]);
  if (!base) {
    document.title = 'Trial not found · TrialPulse';
    main.innerHTML = `<div class="card"><h1>Trial not found</h1><p>No scored trial has the ID <code>${esc(nctId)}</code>. Only interventional trials currently recruiting with a Massachusetts site are scored.</p><p><a href="#/trials">Back to the ranked trials</a></p></div>`;
    return;
  }
  const t = base;
  document.title = `${t.nct_id} · TrialPulse`;

  main.innerHTML = `
    <article class="detail">
      <div class="detail-head">
        <p class="crumbs"><a href="#/trials">Ranked trials</a> › Rank ${fmtInt(t.risk_rank)} of ${fmtInt(summary.n_trials_scored)}</p>
        <h1>${esc(t.title)}</h1>
        <div class="ids">
          <code>${esc(t.nct_id)}</code>
          ${tierBadge(t.risk_tier)}
          <a class="nowrap" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">View on ClinicalTrials.gov ${extIcon}</a>
        </div>
      </div>

      <div class="detail-grid">
        <div>
          <section class="card risk-card" aria-labelledby="risk-h">
            <h2 id="risk-h">Estimated risk of stopping early for low enrollment</h2>
            <div class="headline">
              <span class="big">${fmtPct(t.risk)}<small>estimated risk</small></span>
              <span class="big">${fmtTimes(t.risk_vs_typical)}<small>the typical trial</small></span>
            </div>
            <p class="facts">
              <span>Rank <strong>${fmtInt(t.risk_rank)}</strong> of ${fmtInt(summary.n_trials_scored)}</span>
              <span>Percentile <strong>${esc(t.risk_percentile)}</strong></span>
              <span>Tier <strong>${esc(TIER_LABELS[t.risk_tier] || t.risk_tier)}</strong></span>
            </p>
            <p class="small muted" style="margin:10px 0 0">An estimate from a model trained on past trials, not a certainty. Even among the riskiest 10% of trials, most are expected to finish normally. It says nothing about whether the treatment works.</p>
            <h3 style="margin-top:20px">Why the model scored it this way</h3>
            <p class="small muted">The three design features that moved this trial's score most. They explain the model, not the trial, and they are not advice to the study team.</p>
            ${reasonsHtml(t.top_reasons)}
            ${sourceLine(summary)}
          </section>

          <section class="card eligibility" aria-labelledby="elig-h">
            <h2 id="elig-h">Eligibility criteria</h2>
            <p class="small muted">Shown exactly as registered on ClinicalTrials.gov. Eligibility is decided by the study team.</p>
            <div id="elig-wrap"><p class="loading" style="padding:12px 0">Loading eligibility text…</p></div>
            <div class="required-lines">
              <span>Eligibility is decided by the study team.</span>
              <span>Not medical advice.</span>
            </div>
            ${sourceLine(summary)}
          </section>
        </div>

        <div>
          <section class="card" aria-labelledby="facts-h">
            <h2 id="facts-h">Trial facts</h2>
            <dl class="facts">
              <dt>Phase</dt><dd>${esc(phaseLabel(t.phases))}</dd>
              <dt>Sponsor type</dt><dd>${esc(sponsorLabel(t.sponsor_class))}</dd>
              <dt>Conditions</dt><dd>${(t.conditions || []).length ? (t.conditions || []).map((c) => `<span class="pill">${esc(c)}</span>`).join('') : '<span class="muted">Not listed</span>'}</dd>
              <dt>Condition categories</dt><dd>${(t.condition_categories || []).length ? esc(t.condition_categories.join(', ')) : '<span class="muted">No MeSH category listed</span>'}</dd>
              <dt>Ages</dt><dd>${esc(ageRange(t.min_age, t.max_age))}</dd>
              <dt>Sex</dt><dd>${esc(sexLabel(t.sex))}</dd>
              <dt>Healthy volunteers</dt><dd>${esc(healthyLabel(t.healthy_volunteers))}</dd>
              <dt>Start date</dt><dd>${esc(fmtDate(t.start_date))}</dd>
              <dt>Sites</dt><dd>${fmtInt(t.n_sites)} worldwide, ${fmtInt(t.n_ma_sites)} in Massachusetts</dd>
            </dl>
            ${sourceLine(summary)}
          </section>

          <section class="card" aria-labelledby="sites-h" style="margin-top:20px">
            <h2 id="sites-h">Massachusetts site${(t.ma_sites || []).length === 1 ? '' : 's'}</h2>
            ${sitesHtml(t.ma_sites)}
            <div class="map" id="map" role="img" aria-label="Map of Massachusetts sites for this trial"></div>
            <p class="small muted" style="margin-top:8px">Pins mark the registry's coordinates for each site; several sites in the same city can share one pin.</p>
            ${sourceLine(summary)}
          </section>

          <div class="ctgov-link">
            <a class="btn" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Open ${esc(t.nct_id)} on ClinicalTrials.gov ${extIcon}</a>
            <p class="small muted" style="margin-top:10px">Contacts, locations and current status are on the registry page. Eligibility is decided by the study team. Not medical advice.</p>
          </div>
        </div>
      </div>
    </article>`;

  drawMap(main.querySelector('#map'), t.ma_sites || []);

  // Eligibility text lives only in the full export; fetch it now and cache it.
  const wrap = main.querySelector('#elig-wrap');
  if (!isFullLoaded()) {
    wrap.querySelector('.loading').textContent = 'Loading eligibility text (this is the full 12 MB export, fetched once)…';
  }
  try {
    const full = await loadFullTrial(nctId);
    if (!wrap.isConnected) return;
    wrap.innerHTML = eligibilityHtml(full ? full.eligibility_criteria : null);
    const pre = wrap.querySelector('#elig-text');
    const btn = wrap.querySelector('#elig-toggle');
    if (pre && btn) {
      if (pre.scrollHeight <= pre.clientHeight + 4) { pre.classList.remove('clamped'); btn.parentElement.remove(); }
      btn.addEventListener('click', () => {
        const open = pre.classList.toggle('expanded');
        pre.classList.toggle('clamped', !open);
        btn.setAttribute('aria-expanded', String(open));
        btn.textContent = open ? 'Show less' : 'Show full text';
        if (!open) pre.scrollIntoView({ block: 'start' });
      });
    }
  } catch (err) {
    if (wrap.isConnected) wrap.innerHTML = `<p class="error">Eligibility text could not be loaded. <a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Read it on ClinicalTrials.gov</a>.</p>`;
  }
}
