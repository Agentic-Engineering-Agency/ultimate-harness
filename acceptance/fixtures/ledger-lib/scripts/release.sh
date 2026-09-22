#!/usr/bin/env bash
# Cut a release of ledger-lib. Run from the package directory.
set -euo pipefail

VERSION="0.3.1"
PACKAGE="ledger-lib"

if [ ! -f package.json ]; then
  echo "release.sh must run from the package directory" >&2
  exit 1
fi

echo "checking the suite"
node --test

echo "tagging ${PACKAGE} v${VERSION}"
git tag -a "v${VERSION}" -m "${PACKAGE} ${VERSION}"

echo "done: bump VERSION above before the next release"
