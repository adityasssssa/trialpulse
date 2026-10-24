// Hash router + shell behaviour (theme toggle, nav state, footer source line).
import { loadSummary } from './data.js?v=20261024235854';
import { esc } from './util.js?v=20261024235854';
import { initInfo } from './info.js?v=20261024235854';

const main = document.getElementById('main');

const routes = [
  { pattern: /^\/?$/, load: () => import('./pages/home.js?v=20261024235854'), nav: 'home' },
  { pattern: /^\/trials$/, load: () => import('./pages/trials.js?v=20261024235854'), nav: 'trials' },
  { pattern: /^\/trial\/([A-Za-z0-9]+)$/, load: () => import('./pages/trial.js?v=20261024235854'), nav: 'trials' },
  { pattern: /^\/about$/, load: () => import('./pages/about.js?v=20261024235854'), nav: 'about' },
  { pattern: /^\/ethics$/, load: () => import('./pages/ethics.js?v=20261024235854'), nav: 'ethics' },
  { pattern: /^\/map$/, load: () => import('./pages/map.js?v=20261024235854'), nav: 'map' },
  { pattern: /^\/faq$/, load: () => import('./pages/faq.js?v=20261024235854'), nav: 'faq' },
  { pattern: /^\/team$/, load: () => import('./pages/team.js?v=20261024235854'), nav: 'team' },
];

let renderToken = 0;

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/', query };
}

function setNav(active) {
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function render() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const route = routes.find((r) => r.pattern.test(path));
  if (!route) {
    setNav('');
    document.title = 'Page not found · TrialPulse';
    main.innerHTML = `<div class="card"><h1>Page not found</h1><p>There is nothing at <code>${esc(path)}</code>.</p><p>If you followed a link on this site, your browser may have an older copy of it. <button type="button" class="btn btn-secondary btn-small" id="reload-btn">Reload the site</button></p><p><a href="#/">Go to the home page</a> · <a href="#/trials">Go to the ranked trials</a></p></div>`;
    main.querySelector('#reload-btn').addEventListener('click', () => location.reload());
    return;
  }
  setNav(route.nav);
  const params = route.pattern.exec(path).slice(1);
  main.setAttribute('aria-busy', 'true');
  try {
    const mod = await route.load();
    if (token !== renderToken) return;
    await mod.render(main, { params, query });
  } catch (err) {
    if (token !== renderToken) return;
    console.error(err);
    main.innerHTML = `<div class="error"><strong>Something went wrong.</strong><br>${esc(err.message || err)}</div>`;
  } finally {
    if (token === renderToken) main.removeAttribute('aria-busy');
  }
  if (token !== renderToken) return;
  // Only jump to the top for real navigation, not for filter changes on the same page.
  if (!render.sameRoute) window.scrollTo({ top: 0 });
  render.sameRoute = false;
  const h1 = main.querySelector('h1');
  if (h1 && !render.keepFocus) {
    h1.setAttribute('tabindex', '-1');
    h1.focus({ preventScroll: true });
  }
  render.keepFocus = false;
}

// Pages can ask for a re-render that keeps scroll/focus (e.g. filter changes).
export function softNavigate(hash) {
  render.sameRoute = true;
  render.keepFocus = true;
  if (location.hash === hash) render();
  else location.hash = hash;
}

function initTheme() {
  const btn = document.getElementById('theme-toggle');
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const current = () => document.documentElement.getAttribute('data-theme') || (media.matches ? 'dark' : 'light');
  const updateLabel = () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    btn.setAttribute('aria-label', `Switch to ${next} mode`);
  };
  btn.addEventListener('click', () => {
    const next = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('tp-theme', next); } catch (e) { /* ignore */ }
    updateLabel();
  });
  media.addEventListener('change', updateLabel);
  updateLabel();
}

async function initFooter() {
  try {
    const s = await loadSummary();
    const el = document.getElementById('footer-source');
    const days = Math.max(0, Math.floor((Date.now() - new Date(`${s.data_pulled}T00:00:00Z`).getTime()) / 86400000));
    const age = Number.isFinite(days) ? ` (${days === 0 ? 'today' : days === 1 ? '1 day ago' : `${days} days ago`})` : '';
    if (el) el.textContent = `Source: ${s.data_source || 'ClinicalTrials.gov API v2'}, data pulled ${s.data_pulled}${age}. Trial pages also check the registry live once a day.`;
    const build = document.querySelector('meta[name="build-id"]')?.content;
    const fb = document.getElementById('footer-build');
    if (fb && build && build !== 'dev') fb.textContent = `Site build ${build.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3 $4:$5 UTC')}.`;
  } catch (e) { /* footer keeps its default text */ }
}

initTheme();
initFooter();
initInfo();
window.addEventListener('hashchange', render);
render();
