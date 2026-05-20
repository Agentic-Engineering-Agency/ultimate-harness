#!/usr/bin/env bash
set -euo pipefail

STAGE="${1:-prod}"
cd "$(dirname "$0")/.."

if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "alchemy-destroy: macOS → tsx alchemy.run.ts --stage ${STAGE} --destroy"
  exec bunx tsx alchemy.run.ts --stage "${STAGE}" --destroy
fi

echo "alchemy-destroy: $(uname -s) → alchemy destroy --stage ${STAGE}"
exec bunx alchemy destroy --stage "${STAGE}"
