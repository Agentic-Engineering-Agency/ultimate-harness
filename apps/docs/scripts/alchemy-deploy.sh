#!/usr/bin/env bash
# Alchemy invokes alchemy.run.ts with Bun, which segfaults (SIGSEGV at 0x10)
# on both macOS and Linux (stable + canary; reproduced on depot-ubuntu-24.04
# with the `alchemy deploy` CLI under Bun 1.3.14). Run the program directly
# through tsx (Node) on every platform to avoid Bun executing the config.
set -euo pipefail

STAGE="${1:-prod}"
cd "$(dirname "$0")/.."

echo "alchemy-deploy: $(uname -s) → tsx alchemy.run.ts --stage ${STAGE}"
exec bunx tsx alchemy.run.ts --stage "${STAGE}"
