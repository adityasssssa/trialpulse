#!/usr/bin/env sh
# Serve web/src directly for development (no build step).
# Copies ../exports into web/src/data (gitignored) so fetches work, then serves on port 8080.
set -eu
cd "$(dirname "$0")"
mkdir -p src/data/figures
cp ../exports/*.json src/data/
cp ../exports/figures/*.png src/data/figures/
PORT="${PORT:-8080}"
echo "TrialPulse dev server: http://localhost:$PORT/"
python3 -m http.server "$PORT" --directory src
