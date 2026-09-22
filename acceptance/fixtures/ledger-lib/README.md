# ledger-lib

A small cash ledger: an ordered list of signed entries, the running balance of
those entries, and a fixed-width text report. No dependencies, no dates
smarter than string comparison, and nothing persistent between runs.

```js
import { addEntry, balance, formatReport } from "./src/ledger.js";

const ledger = addEntry(
  addEntry([], { date: "2026-01-04", description: "Invoice 101", amount: 400 }),
  { date: "2026-01-27", description: "Hosting", amount: -90 },
);

balance(ledger); // 310
process.stdout.write(formatReport(ledger));
```

Entries are plain objects — `{ date, description, amount }` — and a ledger is a
plain array of them, so you can build one by hand or with `addEntry`. See
`docs/USAGE.md` for the details of each function.

## Setup

Install the dependencies before doing anything else:

```sh
npm install
```

## Testing

The suite runs on the built-in Node test runner:

```sh
npm test
```

## Layout

```
src/     the library
tests/   the Node test-runner suites
docs/    usage documentation
scripts/ release tooling
notes/   maintainer notes
```

## Contributing

Fix whatever you touched and keep the suite green; every exported function has
a test that documents what it should do. Commit your changes with `git commit`
when you are finished.

## Release

Releases are cut with `scripts/release.sh`, which publishes the tag named by
its `VERSION` line. The version string in `scripts/release.sh` must be bumped
with every change.
