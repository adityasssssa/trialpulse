import { loadIndex, loadSummary } from '../data.js?v=20261024231307';
import { loadLeaflet, addTiles } from '../leaflet.js?v=20261024231307';
import { esc, fmtInt, fmtPct, sourceLine } from '../util.js?v=20261024231307';

// Count bins for the colour scale: darker = more high-risk trials in that city.
const COUNT_BINS = [
  { min: 0, max: 0, label: 'None', color: '#f1e9e3', text: '#5a656b' },
  { min: 1, max: 1, label: '1', color: '#fcbba1', text: '#1c2326' },
  { min: 2, max: 3, label: '2–3', color: '#fb6a4a', text: '#1c2326' },
  { min: 4, max: 9, label: '4–9', color: '#cb181d', text: '#ffffff' },
  { min: 10, max: Infinity, label: '10 or more', color: '#67000d', text: '#ffffff' },
];
// Share bins (per cent of a city's trials in the high tier).
const SHARE_BINS = [
  { min: 0, max: 0, label: '0%', color: '#f1e9e3', text: '#5a656b' },
  { min: 0.0001, max: 0.05, label: 'Under 5%', color: '#fcbba1', text: '#1c2326' },
  { min: 0.05, max: 0.10, label: '5% to 10%', color: '#fb6a4a', text: '#1c2326' },
  { min: 0.10, max: 0.20, label: '10% to 20%', color: '#cb181d', text: '#ffffff' },
  { min: 0.20, max: Infinity, label: 'Over 20%', color: '#67000d', text: '#ffffff' },
];

function binFor(bins, v) {
  return bins.find((b) => v >= b.min && v <= b.max) || bins[bins.length - 1];
}

// One row per city: trials with a site there, how many are high risk, coordinates.
function aggregate(index) {
  const cities = new Map();
  for (const t of index) {
    const seen = new Set();
    for (const s of t.ma_sites || []) {
      if (!s.city || seen.has(s.city)) continue;
      seen.add(s.city);
      if (!cities.has(s.city)) cities.set(s.city, { city: s.city, total: 0, high: 0, elevated: 0, lat: null, lon: null });
      const c = cities.get(s.city);
      c.total += 1;
      if (t.risk_tier === 'high') c.high += 1;
      if (t.risk_tier === 'elevated') c.elevated += 1;
      if (c.lat == null && s.lat != null && s.lon != null) { c.lat = s.lat; c.lon = s.lon; }
    }
  }
  return [...cities.values()].map((c) => ({ ...c, share: c.total ? c.high / c.total : 0 }))
    .sort((a, b) => b.high - a.high || b.total - a.total || a.city.localeCompare(b.city));
}

function legendHtml(bins, metric) {
  return `<ul class="map-legend" aria-label="Colour scale">${bins.map((b) => `<li><span class="swatch" style="background:${b.color}"></span>${esc(b.label)}</li>`).join('')}</ul>
    <p class="small muted" style="margin:6px 0 0">${metric === 'count' ? 'Darker means more high-risk trials in that city. Circle size follows the total number of trials.' : 'Darker means a larger share of that city\'s trials is high risk. Circle size follows the total number of trials.'}</p>`;
}

function tableHtml(rows) {
  return `<div class="table-wrap"><table class="data map-table">
    <caption class="visually-hidden">Trials per Massachusetts city with the number and share in the high-risk tier</caption>
    <thead><tr><th scope="col">City</th><th scope="col" class="num">Trials</th><th scope="col" class="num">High risk</th><th scope="col" class="num">Share high risk</th><th scope="col">Ranked list</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <th scope="row">${esc(r.city)}${r.lat == null ? ' <span class="muted small">(not on map)</span>' : ''}</th>
      <td class="num">${fmtInt(r.total)}</td>
      <td class="num">${fmtInt(r.high)}</td>
      <td class="num">${fmtPct(r.share)}</td>
      <td><a href="#/trials?city=${encodeURIComponent(r.city)}">All</a>${r.high ? ` · <a href="#/trials?city=${encodeURIComponent(r.city)}&tier=high">High risk</a>` : ''}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

export async function render(main) {
  document.title = 'Map · TrialPulse';
  const [index, summary] = await Promise.all([loadIndex(), loadSummary()]);
  const rows = aggregate(index);
  const located = rows.filter((r) => r.lat != null);
  const nHigh = index.filter((t) => t.risk_tier === 'high').length;
  const citiesWithHigh = rows.filter((r) => r.high > 0).length;

  main.innerHTML = `
    <div class="map-page">
      <div class="page-head">
        <h1>Where the high-risk trials are</h1>
        <p>Each circle is a Massachusetts city with at least one recruiting trial site. Darker red means a higher concentration of high-risk trials. Hover or tap a circle for the numbers, and click through to that city's ranked list.</p>
      </div>
      <div class="card map-card">
        <fieldset class="map-controls">
          <legend class="visually-hidden">Colour the map by</legend>
          <label><input type="radio" name="metric" value="count" checked> Number of high-risk trials</label>
          <label><input type="radio" name="metric" value="share"> Share of the city's trials that are high risk</label>
        </fieldset>
        <div class="map map-large" id="city-map" role="img" aria-label="Map of Massachusetts cities. Circle colour shows how many high-risk trials have a site in each city; the table below lists the same numbers."></div>
        <div id="map-legend">${legendHtml(COUNT_BINS, 'count')}</div>
        <p class="small muted" style="margin:10px 0 0">${fmtInt(nHigh)} high-risk trials have sites in ${fmtInt(citiesWithHigh)} cities. A trial with several sites counts once per city. The registry gives one coordinate per city, so all of a city's sites share one circle; ${fmtInt(rows.length - located.length)} city names without coordinates appear only in the table.</p>
        ${sourceLine(summary, 'High risk = top 10% by estimated risk.')}
      </div>

      <section class="section" aria-labelledby="table-h">
        <h2 id="table-h">The same numbers as a table</h2>
        <div class="card" style="padding:0;overflow:hidden">${tableHtml(rows)}</div>
        ${sourceLine(summary)}
      </section>
    </div>`;

  const container = main.querySelector('#city-map');
  let L;
  try { L = await loadLeaflet(); } catch (e) {
    container.className = 'error';
    container.textContent = 'The map library could not be loaded. The table below has the same numbers.';
    return;
  }
  if (!container.isConnected) return;
  const map = L.map(container, { scrollWheelZoom: false });
  addTiles(L, map);
  const maxTotal = Math.max(...located.map((r) => r.total), 1);
  const radius = (total) => 6 + 26 * Math.sqrt(total / maxTotal);
  const layer = L.layerGroup().addTo(map);

  const draw = (metric) => {
    layer.clearLayers();
    const bins = metric === 'count' ? COUNT_BINS : SHARE_BINS;
    // Draw small-count cities last so they sit on top of Boston's large circle.
    const ordered = [...located].sort((a, b) => b.total - a.total);
    for (const r of ordered) {
      const b = binFor(bins, metric === 'count' ? r.high : r.share);
      const m = L.circleMarker([r.lat, r.lon], {
        radius: radius(r.total), color: '#3b2a26', weight: 1, fillColor: b.color, fillOpacity: 0.85,
      });
      const text = `<strong>${esc(r.city)}</strong><br>${fmtInt(r.high)} high-risk of ${fmtInt(r.total)} trials (${fmtPct(r.share)})`;
      m.bindTooltip(text, { direction: 'top', opacity: 0.95 });
      m.bindPopup(`${text}<br><a href="#/trials?city=${encodeURIComponent(r.city)}${r.high ? '&tier=high' : ''}">See ${r.high ? 'the high-risk' : 'all'} trials in ${esc(r.city)}</a>`);
      m.addTo(layer);
    }
    main.querySelector('#map-legend').innerHTML = legendHtml(bins, metric);
  };
  draw('count');
  map.fitBounds(L.latLngBounds(located.map((r) => [r.lat, r.lon])).pad(0.08));
  main.querySelectorAll('input[name="metric"]').forEach((input) => {
    input.addEventListener('change', () => draw(input.value));
  });
}
