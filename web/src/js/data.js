// Data access. Everything comes from ../exports, copied into data/ at build time.
// The index (no eligibility text) powers lists; the full file loads only for a
// trial detail view and is then cached for the session.

const BASE = 'data/';
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
