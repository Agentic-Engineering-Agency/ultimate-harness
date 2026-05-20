#!/usr/bin/env bash
# Alchemy invokes alchemy.run.ts with Bun, which segfaults on macOS (stable + canary).
# Use tsx on Darwin; Linux CI (e.g. depot-ubuntu-24.04) can use the Alchemy CLI.
set -euo pipefail

STAGE="${1:-prod}"
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "alchemy-deploy: macOS → tsx alchemy.run.ts --stage ${STAGE}"
  exec bunx tsx alchemy.run.ts --stage "${STAGE}"
fi

echo "alchemy-deploy: $(uname -s) → alchemy deploy --stage ${STAGE}"
exec bunx alchemy deploy --stage "${STAGE}"
