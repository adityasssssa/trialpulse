// Data access. Everything comes from ../exports, copied into data/ at build time.
// The index (no eligibility text) powers lists; the full file loads only for a
// trial detail view and is then cached for the session.

// Resolved relative to this module, so pages and the tests page share one data path.
const BASE = new URL('../data/', import.meta.url).href;
const cache = new Map();

async function fetchJson(file) {
  if (!cache.has(file)) {
    cache.set(
      file,
      fetch(BASE + file).then((r) => {
        if (!r.ok) throw new Error(`Could not load ${file} (${r.status})`);
        return r.json();
      }).catch((err) => {
        cache.delete(file);
        throw err;
      }),
    );
  }
  return cache.get(file);
}

export const loadSummary = () => fetchJson('summary.json');
export const loadMetrics = () => fetchJson('metrics.json');
export const loadFeatureImportance = () => fetchJson('feature_importance.json');
export const loadIndex = () => fetchJson('ma_trials_index.json');

let fullById = null;
export async function loadFullTrial(nctId) {
  if (!fullById) {
    const rows = await fetchJson('ma_trials.json');
    fullById = new Map(rows.map((r) => [r.nct_id, r]));
  }
  return fullById.get(nctId) || null;
}

export function isFullLoaded() {
  return fullById !== null;
}

export async function findInIndex(nctId) {
  const rows = await loadIndex();
  return rows.find((r) => r.nct_id === nctId) || null;
}

// Eligibility text for one trial. Tries the small per-trial file written at
// build time first; falls back to the full export (cached) if it is missing.
export async function loadEligibility(nctId) {
  try {
    const r = await fetch(`${BASE}eligibility/${encodeURIComponent(nctId)}.json`);
    if (r.ok) {
      const j = await r.json();
      return { text: j.eligibility_criteria ?? null, source: 'per-trial' };
    }
  } catch (e) { /* fall through */ }
  const full = await loadFullTrial(nctId);
  return { text: full ? full.eligibility_criteria : null, source: 'full-file' };
}
