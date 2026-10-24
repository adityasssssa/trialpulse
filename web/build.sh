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
