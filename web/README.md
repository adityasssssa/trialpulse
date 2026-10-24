# TrialPulse website

The public site for TrialPulse: a ranked list of the 2,618 interventional clinical trials currently recruiting in Massachusetts, ordered by their estimated risk of stopping early because they cannot enroll enough participants. It is a prioritization aid for hospital recruitment offices. It ranks trials, never people.

Everything the site shows comes from the frozen, audited exports in [`../exports/`](../exports/), described in [`../HANDOFF.md`](../HANDOFF.md). The site never edits that data; it only copies it at build time.

## Stack

A dependency-free static site: plain HTML, CSS and JavaScript ES modules with a hash router, so it runs from any static host (GitHub Pages, Netlify, Vercel) with no backend and no build toolchain. There is no `npm install`: the only tools needed are a POSIX shell and Python 3 (for the local server and a JSON sanity check in the build). Leaflet 1.9.4 and OpenStreetMap tiles provide the site maps on trial pages, loaded from a CDN with integrity hashes only when a trial page opens. Inter and Source Serif 4 come from Google Fonts.

```
web/
├── src/                 the app
│   ├── index.html       shell: header, nav, footer, theme toggle
│   ├── css/styles.css   light and dark themes, risk-tier colors, layout
│   └── js/
│       ├── app.js       hash router, theme, footer source line
│       ├── data.js      loads exports; caches the 12 MB full file after first use
│       ├── util.js      formatting, labels, HTML escaping
│       ├── leaflet.js   on-demand Leaflet loader (CDN, integrity hashes)
│       ├── info.js      plain-language phase cards behind the 'i' buttons
│       └── pages/       home.js, trials.js, trial.js, about.js, ethics.js, map.js, faq.js
├── build.sh             src + ../exports → dist/
├── dev.sh               local server with a data copy (no build)
├── deploy-gh-pages.sh   publish dist/ to the gh-pages branch
└── dist/                build output (gitignored)
```

Pages (all under `#/` so they work on any static host without rewrite rules):

| Route | What it shows |
|---|---|
| `#/` | Problem statement, headline numbers from `summary.json`, tier legend, the five highest estimated risks |
| `#/trials` | All trials ranked by risk with filters (tier, condition category, phase, sponsor type, city, facility) and search on title, condition and NCT ID. Filters live in the URL, so a filtered view can be shared |
| `#/trial/NCT…` | Risk, tier, percentile, "N× typical", the three top reasons, trial facts, Massachusetts sites with a map, verbatim eligibility criteria and the ClinicalTrials.gov link |
| `#/about` | What is and is not predicted, training and test setup, the metrics table from `metrics.json`, the label hand-check, global feature importance, the evaluation figures and every known limit from HANDOFF.md |
| `#/ethics` | Our promise, what is and is not predicted, data used, how we checked ourselves, a fairness table and chart computed live from `ma_trials_index.json`, expert review notes, known limits, what's next, and links |
| `#/map` | Interactive map of Massachusetts cities: darker circles mean more high-risk trials (or a larger share, via a toggle), with hover numbers, click-through to the filtered list, and the same numbers as a table |
| `#/faq` | Frequently asked questions, answered from `summary.json` |

Data loading: `ma_trials_index.json` (4 MB) powers the list, home and search. `ma_trials.json` (12.5 MB, with eligibility text) is fetched only when a trial page opens and is then cached for the session.

## Run locally

```bash
./dev.sh
```

Copies `../exports` into `src/data/` (gitignored) and serves `src/` at <http://localhost:8080/>. Edit files under `src/` and reload. Set `PORT=3000 ./dev.sh` for another port.

## Build

```bash
./build.sh
```

Produces `dist/`: a copy of `src/` plus `dist/data/` (the JSON exports and figures) and a `.nojekyll` marker. The script fails if an export file is missing or any JSON does not parse. To preview the production build:

```bash
python3 -m http.server 8080 --directory dist
```

## Deploy

The site is static, so any host that serves files works. Build output is `web/dist`.

**GitHub Pages** (used for the live site):

```bash
./deploy-gh-pages.sh
```

builds, commits `dist/` to the `gh-pages` branch and pushes it. One-time setup in the repository: Settings → Pages → Source "Deploy from a branch", branch `gh-pages`, folder `/ (root)`. The site then lives at `https://<owner>.github.io/trialpulse/`. The script never touches `main`, `website` or any tag.

**Netlify:** new site from the repo with base directory `web`, build command `./build.sh`, publish directory `web/dist`.

**Vercel:** import the repo with root directory `web`, framework "Other", build command `./build.sh`, output directory `dist`.

## Display rules the site follows

From `HANDOFF.md`; judges check these.

- Every card, table or chart with a number carries "Source: ClinicalTrials.gov API v2" with the data pull date from `summary.json`.
- The model predicts enrollment-related early termination only. The site never calls it trial "success", "failure", quality or treatment effect.
- It ranks trials, never people. There is no patient input, matching, screening or chatbot.
- Every trial page shows "Eligibility is decided by the study team." and "Not medical advice." and links to the trial on ClinicalTrials.gov.
- Eligibility text is rendered verbatim (HTML-escaped, preformatted, line breaks preserved) with a show-more toggle. Nothing rewrites it.
- Scores are described as estimates and a ranking. The known limits are one click away from every page (footer → About the model).
- Nothing on the site is invented. Every number, label and reason comes from `../exports/`.
