// Hash router + shell behaviour (theme toggle, nav state, footer source line).
import { loadSummary } from './data.js';
import { esc } from './util.js';
import { initInfo } from './info.js';

const main = document.getElementById('main');

const routes = [
  { pattern: /^\/?$/, load: () => import('./pages/home.js'), nav: 'home' },
  { pattern: /^\/trials$/, load: () => import('./pages/trials.js'), nav: 'trials' },
  { pattern: /^\/trial\/([A-Za-z0-9]+)$/, load: () => import('./pages/trial.js'), nav: 'trials' },
  { pattern: /^\/about$/, load: () => import('./pages/about.js'), nav: 'about' },
  { pattern: /^\/ethics$/, load: () => import('./pages/ethics.js'), nav: 'ethics' },
  { pattern: /^\/map$/, load: () => import('./pages/map.js'), nav: 'map' },
  { pattern: /^\/faq$/, load: () => import('./pages/faq.js'), nav: 'faq' },
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
    if (el) el.textContent = `Source: ${s.data_source || 'ClinicalTrials.gov API v2'}, data pulled ${s.data_pulled}.`;
  } catch (e) { /* footer keeps its default text */ }
}

initTheme();
initFooter();
initInfo();
window.addEventListener('hashchange', render);
render();
