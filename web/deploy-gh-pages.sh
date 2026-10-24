#!/usr/bin/env sh
# Build the site and publish web/dist to the gh-pages branch of origin.
# GitHub Pages must be set to serve from "gh-pages" / root (repo Settings → Pages).
# Never touches main, the website branch or any tag.
set -eu
cd "$(dirname "$0")"
./build.sh
cd ..
TMP_INDEX="$(mktemp -u)"
export GIT_INDEX_FILE="$TMP_INDEX"
git --work-tree=web/dist add -A
TREE="$(git write-tree)"
unset GIT_INDEX_FILE
rm -f "$TMP_INDEX"
PARENT=""
if git show-ref --quiet refs/heads/gh-pages; then PARENT="-p $(git rev-parse refs/heads/gh-pages)"; fi
COMMIT="$(printf 'Deploy TrialPulse site from %s\n' "$(git rev-parse --short HEAD)" | git commit-tree "$TREE" $PARENT)"
git update-ref refs/heads/gh-pages "$COMMIT"
echo "gh-pages -> $COMMIT"
git push origin gh-pages
