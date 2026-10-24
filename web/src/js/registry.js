// Live status from the ClinicalTrials.gov API v2, checked at most once per
// calendar day per trial and cached in localStorage. This never changes a
// score; it only shows what the registry says today.
const API = 'https://clinicaltrials.gov/api/v2/studies/';
const FIELDS = 'NCTId,OverallStatus,LastUpdatePostDate,StatusVerifiedDate,StartDate,PrimaryCompletionDate,WhyStopped';

const STATUS_LABELS = {
  RECRUITING: 'Recruiting',
  NOT_YET_RECRUITING: 'Not yet recruiting',
  ENROLLING_BY_INVITATION: 'Enrolling by invitation',
  ACTIVE_NOT_RECRUITING: 'Active, not recruiting',
  SUSPENDED: 'Suspended',
  TERMINATED: 'Terminated',
  COMPLETED: 'Completed',
  WITHDRAWN: 'Withdrawn',
  UNKNOWN: 'Unknown status',
};

export const statusLabel = (s) => STATUS_LABELS[s] || (s ? s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : 'Unknown');

const today = () => new Date().toISOString().slice(0, 10);

export async function fetchLiveStatus(nctId) {
  const key = `tp-live-${nctId}`;
  try {
    const cached = JSON.parse(localStorage.getItem(key) || 'null');
    if (cached && cached.checked === today()) return cached;
  } catch (e) { /* ignore */ }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  const r = await fetch(`${API}${encodeURIComponent(nctId)}?fields=${FIELDS}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
  clearTimeout(timer);
  if (!r.ok) throw new Error(`Registry returned ${r.status}`);
  const j = await r.json();
  const sm = j?.protocolSection?.statusModule || {};
  const out = {
    checked: today(),
    status: sm.overallStatus || null,
    lastUpdate: sm.lastUpdatePostDateStruct?.date || null,
    verified: sm.statusVerifiedDate || null,
    start: sm.startDateStruct?.date || null,
    primaryCompletion: sm.primaryCompletionDateStruct?.date || null,
    whyStopped: sm.whyStopped || null,
  };
  try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) { /* storage full or blocked */ }
  return out;
}
