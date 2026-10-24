#!/usr/bin/env sh
# Build the TrialPulse static site into web/dist.
# Copies web/src (the app) and ../exports (the frozen data) into dist/.
# The exports are never edited: this script only copies them.
set -eu
cd "$(dirname "$0")"
EXPORTS="../exports"
OUT="dist"

for f in ma_trials_index.json ma_trials.json summary.json metrics.json feature_importance.json; do
  [ -f "$EXPORTS/$f" ] || { echo "missing $EXPORTS/$f" >&2; exit 1; }
done

rm -rf "$OUT"
mkdir -p "$OUT/data/figures"
cp -R src/. "$OUT/"
rm -rf "$OUT/data"
mkdir -p "$OUT/data/figures"
cp "$EXPORTS"/*.json "$OUT/data/"
cp "$EXPORTS"/figures/*.png "$OUT/data/figures/"
# GitHub Pages: disable Jekyll so nothing is skipped or rewritten.
touch "$OUT/.nojekyll"

# Cache busting: append ?v=<build id> to every local script and stylesheet
# reference, so browsers and the GitHub Pages CDN never pair a new index.html
# with an old module (which showed "Page not found" for new routes).
BUILD_ID="$(date -u +%Y%m%d%H%M%S)"
python3 - "$OUT" "$BUILD_ID" <<'PY'
import os, re, sys
out, v = sys.argv[1], sys.argv[2]
for root, _, files in os.walk(os.path.join(out, "js")):
    for f in files:
        if not f.endswith(".js"):
            continue
        p = os.path.join(root, f)
        with open(p, encoding="utf-8") as fh:
            s = fh.read()
        s = re.sub(r"(from\s+'(?:\.\.?/[^']+?)\.js)'", lambda m: f"{m.group(1)}?v={v}'", s)
        s = re.sub(r"import\('((?:\.\.?/[^']+?)\.js)'\)", lambda m: f"import('{m.group(1)}?v={v}')", s)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(s)
p = os.path.join(out, "index.html")
with open(p, encoding="utf-8") as fh:
    s = fh.read()
s = s.replace('href="css/styles.css"', f'href="css/styles.css?v={v}"')
s = s.replace('src="js/app.js"', f'src="js/app.js?v={v}"')
with open(p, "w", encoding="utf-8") as fh:
    fh.write(s)
print("build id", v)
PY

# Quick sanity check that every JSON file parses.
python3 - "$OUT/data" <<'PY'
import json, os, sys
d = sys.argv[1]
for f in sorted(os.listdir(d)):
    if f.endswith(".json"):
        with open(os.path.join(d, f), encoding="utf-8") as fh:
            json.load(fh)
print("data ok:", ", ".join(f for f in sorted(os.listdir(d)) if f.endswith(".json")))
PY
echo "built $OUT/ ($(du -sh "$OUT" | cut -f1))"
