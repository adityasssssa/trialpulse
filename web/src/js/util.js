// Small formatting and HTML helpers shared by every page.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const fmtInt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));

export function fmtPct(fraction, digits = 1) {
  if (fraction == null || Number.isNaN(fraction)) return '—';
  return `${(fraction * 100).toFixed(digits)}%`;
}

export function fmtTimes(x) {
  if (x == null) return '—';
  return `${Number(x).toFixed(1)}×`;
}

export function fmtNum(x, digits = 3) {
  if (x == null) return '—';
  return Number(x).toFixed(digits);
}

const PHASE_LABELS = {
  EARLY_PHASE1: 'Early Phase 1',
  PHASE1: 'Phase 1',
  PHASE2: 'Phase 2',
  PHASE3: 'Phase 3',
  PHASE4: 'Phase 4',
  NA: 'Not applicable',
};

// ["PHASE1","PHASE2"] -> "Phase 1/2"; ["NA"] -> "Not applicable"; [] -> "Not specified"
export function phaseLabel(phases) {
  if (!phases || phases.length === 0) return 'Not specified';
  const numbered = phases.filter((p) => /^PHASE\d$/.test(p));
  if (numbered.length === phases.length && numbered.length > 1) {
    return `Phase ${numbered.map((p) => p.replace('PHASE', '')).join('/')}`;
  }
  return phases.map((p) => PHASE_LABELS[p] || p).join(', ');
}

// Key used for the phase filter: one option per distinct phases combination.
export function phaseKey(phases) {
  return (phases && phases.length ? phases : ['UNSPECIFIED']).join('+');
}

const SPONSOR_LABELS = {
  INDUSTRY: 'Industry',
  OTHER: 'Academic / other',
  NIH: 'NIH',
  FED: 'US federal agency',
  OTHER_GOV: 'Other government',
  NETWORK: 'Research network',
  INDIV: 'Individual',
  AMBIG: 'Ambiguous',
  UNKNOWN: 'Unknown',
};

export function sponsorLabel(cls) {
  if (cls == null) return 'Not specified';
  return SPONSOR_LABELS[cls] || cls;
}

// Friendlier names for a few model inputs when shown as per-trial reasons.
const REASON_LABELS = { 'Healthy volunteers accepted': 'Healthy volunteers' };
export const reasonLabel = (label) => REASON_LABELS[label] || label;

export const TIER_LABELS = { high: 'High risk', elevated: 'Elevated risk', typical: 'Typical risk' };
export const TIER_ORDER = ['high', 'elevated', 'typical'];

export function tierBadge(tier) {
  const t = TIER_ORDER.includes(tier) ? tier : 'typical';
  return `<span class="tier tier-${t}">${esc(TIER_LABELS[t])}</span>`;
}

export function sexLabel(sex) {
  if (sex === 'ALL') return 'All sexes';
  if (sex === 'FEMALE') return 'Female';
  if (sex === 'MALE') return 'Male';
  return 'Not specified';
}

export function ageRange(min, max) {
  if (min == null && max == null) return 'No age limits listed';
  if (min != null && max == null) return `${min} and older (no maximum)`;
  if (min == null && max != null) return `Up to ${max} (no minimum)`;
  return `${min} to ${max}`;
}

export function healthyLabel(v) {
  if (v === true) return 'Yes, accepted';
  if (v === false) return 'No, patients only';
  return 'Not specified';
}

export function fmtDate(s) {
  if (!s) return 'Not listed';
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s);
  if (!m) return s;
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const month = months[Number(m[2]) - 1] || m[2];
  return m[3] ? `${month} ${Number(m[3])}, ${m[1]}` : `${month} ${m[1]}`;
}

export function sourceLine(summary, extra = '') {
  const pulled = summary?.data_pulled ? `, data pulled ${esc(summary.data_pulled)}` : '';
  return `<p class="source">Source: ClinicalTrials.gov API v2${pulled}.${extra ? ' ' + extra : ''}</p>`;
}

// Normalize text for search: lower-case, strip accents.
export function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function parseQuery(qs) {
  const out = {};
  if (!qs) return out;
  for (const part of qs.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

export function buildQuery(obj) {
  const parts = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v == null || v === '') continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.join('&');
}

export function siteSummary(trial, max = 2) {
  const sites = trial.ma_sites || [];
  const names = [];
  const seen = new Set();
  for (const s of sites) {
    const name = s.facility || (s.city ? `Site in ${s.city}` : 'Massachusetts site');
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  const shown = names.slice(0, max);
  const more = names.length - shown.length;
  return { shown, more, total: sites.length };
}

// ---- City normalization (one shared layer; exports/ are never edited) ----
// Exact registry misspellings mapped to the correct Massachusetts city. The
// original value stays available (see registeredCity) for traceability.
export const CITY_FIXES = { Worester: 'Worcester', Worchester: 'Worcester', Sommerville: 'Somerville' };
export const normalizeCity = (city) => (city == null ? null : (CITY_FIXES[city] || city));
export const registeredCity = (city) => city;
export const cityWasFixed = (city) => city != null && Object.prototype.hasOwnProperty.call(CITY_FIXES, city);

// Distinct normalized cities for a trial.
export function trialCities(trial) {
  return [...new Set((trial.ma_sites || []).map((s) => normalizeCity(s.city)).filter(Boolean))];
}

export const startYear = (trial) => (trial.start_date ? Number(trial.start_date.slice(0, 4)) : null);

// Wilson 95% interval for a proportion, as [low, high].
export function wilson(p, n, z = 1.96) {
  if (!n || p == null) return null;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
