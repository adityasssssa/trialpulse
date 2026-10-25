import { findInIndex, loadEligibility, loadSummary } from '../data.js';
import { loadLeaflet, addTiles } from '../leaflet.js';
import { fetchLiveStatus, statusLabel } from '../registry.js';
import {
  esc, fmtInt, fmtPct, fmtTimes, tierBadge, sourceLine, phaseLabel, sponsorLabel, sexLabel,
  ageRange, healthyLabel, fmtDate, TIER_LABELS, reasonLabel, normalizeCity, cityWasFixed,
} from '../util.js';
import { infoButton, phaseWithInfo } from '../info.js';

const extIcon = '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function reasonsHtml(reasons) {
  if (!reasons || !reasons.length) return '<p class="muted">No reasons available.</p>';
  return `<ol class="reasons">${reasons.map((r) => {
    const raises = r.direction === 'raises risk';
    const label = reasonLabel(r.feature_label);
    const same = !r.plain_english || r.plain_english === r.feature_label || r.plain_english === label;
    return `<li class="reason">
      <span class="dir ${raises ? 'raises' : 'lowers'}">${raises ? '▲ raises risk' : '▼ lowers risk'}</span>
      <span><span class="what">${esc(label)}</span>${same ? '' : `<br><span class="val">${esc(r.plain_english)}</span>`}</span>
    </li>`;
  }).join('')}</ol>`;
}

function sitesHtml(sites) {
  if (!sites || !sites.length) return '<p class="muted">No Massachusetts sites listed.</p>';
  return `<ul class="site-list">${sites.map((s) => `<li>
    ${esc(s.facility || 'Facility name not listed')}${s.city ? ` <span class="city">· ${esc(normalizeCity(s.city))}, MA${cityWasFixed(s.city) ? ` <span class="muted small">(registered as “${esc(s.city)}”)</span>` : ''}</span>` : ''}
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
  addTiles(L, map);
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

// Minimal, dependency-free rendering of the registry's Markdown-style text.
// Only structure is interpreted (bullets, paragraphs) and backslash escapes
// such as "\<" are resolved. No wording is changed.
function unescapeMd(s) {
  return s.replace(/\\([\\`*_{}\[\]()#+\-.!<>|~&^])/g, "$1");
}
function inlineMd(s) {
  return esc(unescapeMd(s));
}
function markdownToHtml(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let html = '';
  let inList = false;
  let para = [];
  const flushPara = () => {
    if (!para.length) return;
    const joined = para.join('\n');
    const heading = para.length === 1 && /^(inclusion|exclusion|key inclusion|key exclusion)[^\n]{0,40}:?$/i.test(joined.trim());
    html += heading ? `<p class="elig-head">${inlineMd(joined)}</p>` : `<p>${inlineMd(joined)}</p>`;
    para = [];
  };
  const closeList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of lines) {
    const bullet = /^(\s*)[*\-•]\s+(.*)$/.exec(raw);
    if (bullet) {
      flushPara();
      if (!inList) { html += '<ul>'; inList = true; }
      const level = Math.min(4, Math.floor(bullet[1].length / 2));
      html += `<li style="--lvl:${level}">${inlineMd(bullet[2])}</li>`;
    } else if (raw.trim() === '') {
      closeList();
      flushPara();
    } else {
      closeList();
      para.push(raw);
    }
  }
  closeList();
  flushPara();
  return html;
}

function eligibilityHtml(text) {
  if (text == null) return '<p class="muted">No eligibility criteria text is listed in the registry for this trial.</p>';
  return `<div id="elig-text" class="elig-body clamped">${markdownToHtml(text)}</div>
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
        ${(t.conditions && t.conditions[0])
          ? `<h1>${esc(t.conditions[0])}${/^Phase|^Early/.test(phaseLabel(t.phases)) ? `<span class="h1-sub"> · ${esc(phaseLabel(t.phases))} trial</span>` : ''}</h1>
             <p class="reg-title-full"><span class="muted">Registered title:</span> ${esc(t.title)}</p>`
          : `<h1>${esc(t.title)}</h1>`}
        <div class="ids">
          <code>${esc(t.nct_id)}</code>
          ${tierBadge(t.risk_tier)}
          <a class="nowrap" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">View on ClinicalTrials.gov ${extIcon}</a>
        </div>
      </div>

      <div class="detail-grid">
        <div>
          <section class="card risk-card" aria-labelledby="risk-h">
            <h2 id="risk-h">Risk of stopping early for low enrollment</h2>
            <div class="headline">
              <span class="big">${fmtTimes(t.risk_vs_typical)}<small>the typical trial's estimated risk</small></span>
              <span class="big">#${fmtInt(t.risk_rank)}<small>of ${fmtInt(summary.n_trials_scored)} ranked trials</small></span>
            </div>
            <p class="facts">
              <span><strong>${esc(TIER_LABELS[t.risk_tier] || t.risk_tier)}</strong> tier ${infoButton('TIER', 'What the risk tiers and “× typical” mean')}</span>
              <span>Top <strong>${Math.max(1, Math.ceil((t.risk_rank / summary.n_trials_scored) * 100))}%</strong> of the ranking</span>
              <span>Model estimate <strong>${fmtPct(t.risk)}</strong></span>
            </p>
            <p class="small muted" style="margin:10px 0 0">Use the tier and rank as a priority order. The percentage is the model's estimated probability that this trial is stopped with low enrollment given as the reason; it was checked on past trials, not on today's recruiting trials, so treat it as approximate. The score says nothing about whether the treatment works or is safe.</p>
            <h3 style="margin-top:20px">Why this score</h3>
            <p class="small muted">The three model inputs that moved this trial's score most (SHAP values). They describe associations the model learned from past trials, not causes, and they do not say what would fix enrollment. The model also uses the site's country, which is never listed here but still affects the score; see the About page.</p>
            ${reasonsHtml(t.top_reasons)}
            ${sourceLine(summary, 'Scores were computed from this snapshot.')}
          </section>

          <section class="card next-card" aria-labelledby="next-h">
            <h2 id="next-h">What to do next</h2>
            <p class="small muted">The score only flags a trial for human review. A coordinator decides what, if anything, to do.</p>
            <h3>Questions for the review</h3>
            <ul class="checks">
              <li>Is the trial still open to new participants? Check the registry status above and confirm with the site.</li>
              <li>How is enrollment going against the plan, and is there a target date for closing accrual?</li>
              <li>Are the eligibility criteria narrower than the local patient population, and does the study team know?</li>
              <li>Which clinics, practices or community groups see the people this trial needs, and have they been told it exists?</li>
            </ul>
            <h3>Outreach options that recruitment offices commonly use</h3>
            <ul class="checks">
              <li>Brief referring clinicians and tumor boards or specialty clinics about the open trial.</li>
              <li>Share plain-language study information with patient advocacy groups and community health partners.</li>
              <li>Add the trial to institutional trial listings and screening workflows.</li>
              <li>Ask the study team whether additional Massachusetts sites or remote visits are possible.</li>
            </ul>
            <p class="small muted">These are general options, not recommendations for this trial. The reasons shown above describe what the model learned, not which action would work. Eligibility is decided by the study team.</p>
          </section>

          <section class="card eligibility" aria-labelledby="elig-h">
            <h2 id="elig-h">Who can join, as registered</h2>
            <p class="small muted">Shown word for word from ClinicalTrials.gov. Eligibility is decided by the study team.</p>
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
              <dt>Phase</dt><dd>${phaseWithInfo(t.phases)}</dd>
              <dt>Sponsor type</dt><dd>${esc(sponsorLabel(t.sponsor_class))}</dd>
              <dt>Conditions</dt><dd>${(t.conditions || []).length ? (t.conditions || []).map((c) => `<span class="pill">${esc(c)}</span>`).join('') : '<span class="muted">Not listed</span>'}</dd>
              <dt>Condition categories</dt><dd>${(t.condition_categories || []).length ? esc(t.condition_categories.join(', ')) : '<span class="muted">No MeSH category listed</span>'}</dd>
              <dt>Ages</dt><dd>${esc(ageRange(t.min_age, t.max_age))}</dd>
              <dt>Sex</dt><dd>${esc(sexLabel(t.sex))}</dd>
              <dt>Healthy volunteers</dt><dd>${esc(healthyLabel(t.healthy_volunteers))}</dd>
              <dt>Start date</dt><dd>${esc(fmtDate(t.start_date))}</dd>
              <dt>Sites</dt><dd>${fmtInt(t.n_sites)} ${t.n_sites === 1 ? 'site' : 'sites'} worldwide, ${fmtInt(t.n_ma_sites)} in Massachusetts</dd>
            </dl>
            ${sourceLine(summary)}
          </section>

          <section class="card live-card" aria-labelledby="live-h" style="margin-top:20px">
            <h2 id="live-h">Registry status today</h2>
            <div id="live-status"><p class="loading" style="padding:4px 0">Checking ClinicalTrials.gov…</p></div>
          </section>

          <section class="card" aria-labelledby="sites-h" style="margin-top:20px">
            <h2 id="sites-h">Massachusetts site${(t.ma_sites || []).length === 1 ? '' : 's'}</h2>
            ${sitesHtml(t.ma_sites)}
            <div class="map" id="map" role="img" aria-label="Map of Massachusetts sites for this trial"></div>
            <p class="small muted" style="margin-top:8px">Sites in the same city can share one pin.</p>
            ${sourceLine(summary)}
          </section>

          <div class="ctgov-link">
            <a class="btn" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Open ${esc(t.nct_id)} on ClinicalTrials.gov ${extIcon}</a>
            <p class="small muted" style="margin-top:10px">Contacts, all locations and current status are on the registry page.</p>
          </div>
        </div>
      </div>
    </article>`;

  drawMap(main.querySelector('#map'), t.ma_sites || []);

  // Live registry check (daily, cached). Shown beside the frozen score, never used to change it.
  const live = main.querySelector('#live-status');
  fetchLiveStatus(nctId).then((r) => {
    if (!live.isConnected) return;
    const changed = r.status && r.status !== 'RECRUITING';
    live.innerHTML = `
      <p class="live-line"><span class="live-badge ${changed ? 'changed' : 'ok'}">${esc(statusLabel(r.status))}</span></p>
      ${changed ? `<p class="small conflict"><strong>Differs from the scored snapshot.</strong> On ${esc(summary.data_pulled)} the registry listed this trial as recruiting, which is why it was scored. Today it is listed as “${esc(statusLabel(r.status))}”. The score was not recomputed.</p>` : `<p class="small muted">Matches the snapshot of ${esc(summary.data_pulled)}, which listed this trial as recruiting.</p>`}
      <dl class="facts small-facts">
        <dt>Last registry update</dt><dd>${esc(fmtDate(r.lastUpdate))}</dd>
        <dt>Status verified</dt><dd>${esc(fmtDate(r.verified))}</dd>
        <dt>Primary completion</dt><dd>${esc(fmtDate(r.primaryCompletion))}</dd>
        ${r.whyStopped ? `<dt>Why stopped</dt><dd>${esc(r.whyStopped)}</dd>` : ''}
      </dl>
      <p class="source">Source: ClinicalTrials.gov API v2, live check ${esc(r.checked)} (rechecked once a day). Score snapshot: ${esc(summary.data_pulled)}.</p>`;
  }).catch(() => {
    if (live.isConnected) live.innerHTML = `<p class="small muted">Live status unavailable right now. <a href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Check on ClinicalTrials.gov</a>.</p>`;
  });

  // Eligibility text comes from a small per-trial file (with the full export as fallback).
  const wrap = main.querySelector('#elig-wrap');
  try {
    const elig = await loadEligibility(nctId);
    if (!wrap.isConnected) return;
    wrap.innerHTML = eligibilityHtml(elig.text);
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
