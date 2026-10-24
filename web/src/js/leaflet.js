// Loads Leaflet 1.9.4 from a CDN on demand, with integrity hashes. Shared by
// the trial page map and the Map page.
const VERSION = '1.9.4';
const JS = `https://unpkg.com/leaflet@${VERSION}/dist/leaflet.js`;
const CSS = `https://unpkg.com/leaflet@${VERSION}/dist/leaflet.css`;
const JS_SRI = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
const CSS_SRI = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';

let pending = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (!pending) {
    pending = new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet'; css.href = CSS; css.integrity = CSS_SRI; css.crossOrigin = '';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = JS; js.integrity = JS_SRI; js.crossOrigin = '';
      js.onload = () => resolve(window.L);
      js.onerror = () => { pending = null; reject(new Error('Map library could not be loaded')); };
      document.head.appendChild(js);
    });
  }
  return pending;
}

export function addTiles(L, map) {
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
}
