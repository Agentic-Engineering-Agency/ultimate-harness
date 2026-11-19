#!/usr/bin/env bash
# Rebuild the interactive code explorer served at /explorer/.
#
# The explorer is the static "demo" build of the Understand-Anything dashboard
# (MIT, https://github.com/Egonex-AI/Understand-Anything), pinned to the commit
# below. It reads /explorer/knowledge-graph.json, which scripts/sync-codemap.mjs
# copies from apps/site/codemap/ on every site build. Only rerun this script to
# pick up a newer dashboard; refreshing the graph itself does not need it.
#
# Requires Node 22+ and pnpm 10. Usage: bash scripts/build-explorer.sh
set -euo pipefail

UA_REPO=https://github.com/Egonex-AI/Understand-Anything
UA_COMMIT=6df3065
SITE_DIR=$(cd "$(dirname "$0")/.." && pwd)
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

git clone --quiet "$UA_REPO" "$WORK/ua"
git -C "$WORK/ua" checkout --quiet "$UA_COMMIT"
cd "$WORK/ua/understand-anything-plugin"
pnpm install --frozen-lockfile
pnpm --filter @understand-anything/core build
cd packages/dashboard
npx tsc -b
npx vite build --config vite.config.demo.ts --base /explorer/ --outDir "$WORK/dist" --emptyOutDir

rm -rf "$SITE_DIR/public/explorer"
mkdir -p "$SITE_DIR/public/explorer"
cp -r "$WORK/dist/." "$SITE_DIR/public/explorer/"
rm -f "$SITE_DIR/public/explorer/knowledge-graph.json"
cp "$WORK/ua/LICENSE" "$SITE_DIR/public/explorer/LICENSE.txt"
sed -i.bak 's#<title>Understand Anything</title>#<title>UH Code Explorer</title>#' "$SITE_DIR/public/explorer/index.html"
rm -f "$SITE_DIR/public/explorer/index.html.bak"
echo "explorer rebuilt from $UA_REPO@$UA_COMMIT"
