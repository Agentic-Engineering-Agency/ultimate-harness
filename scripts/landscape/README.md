# Landscape register freshness check

`verify-register.mjs` re-checks the quoted passages in
`docs/research/landscape-register.json` against their source pages. It fetches
sources with a 20-second timeout and one retry, normalizes HTML to words, and
compares the quote's 4-grams with the source's 4-grams. A quote is verified at
coverage `>= 0.85`; lower coverage from a successful page is drifted.

GitHub repository URLs are also checked through the raw `README.md` URL, and
GitHub blob URLs through their raw file URL. Other non-Markdown URLs also try
`<url>.md` and `<url>/index.md` after the primary page. These fallbacks handle
client-rendered pages and pages whose readable content is published as raw
Markdown. The normalizer follows the original one-off verifier: decode HTML
entities, replace tags with whitespace, lowercase, and discard non-ASCII
letters and digits before making 4-grams.

## Running it

From the repository root:

```sh
npm run landscape:verify
```

Useful options:

```sh
npm run landscape:verify -- --only "Cursor CLI"
npm run landscape:verify -- --concurrency 8 --json /tmp/landscape-result.json
npm run landscape:verify -- --fixture-dir tests/fixtures/landscape
node scripts/landscape/verify-register.mjs --register tests/fixtures/landscape/register.json --fixture-dir tests/fixtures/landscape
```

`--only` matches the tool name or source URL. `--concurrency` defaults to 4.
`--json` writes the rows, summary counts, and selected exit code. With
`--fixture-dir`, each URL is read from a file named with its SHA-256 URL hash
(`.html`, `.md`, or `.txt`); this avoids network access when replaying captured
snapshots. A same-hash `.status` sidecar can represent a captured non-2xx
response. The optional `--register` flag is useful for testing a copied
register; the default input remains `docs/research/landscape-register.json`.

## Reading the output

One state line is printed for every selected row, followed by a complete summary:

```text
verified Verified Tool https://fixtures.test/verified coverage=1.00
drifted Drifted Tool https://fixtures.test/drifted coverage=0.00
unreachable Unreachable Tool https://fixtures.test/unreachable coverage=0.00
unverifiable Guide Tool orca://skills/test coverage=0.00
landscape: verified 1 drifted 1 unreachable 1 unverifiable 1 of 4
```

- `verified`: a fetched source has at least 85% quote 4-gram coverage.
- `drifted`: a fetched source has less than 85% coverage; review and re-quote it.
- `unreachable`: every attempted source variant failed or returned a non-2xx status.
- `unverifiable`: the row has no URL or is marked as sourced from an installed/local guide.

The command exits 1 if any row drifted. It exits 2 if there are unreachable rows
and no drifted rows, otherwise it exits 0.

## Monthly procedure

1. Run `npm run landscape:verify` and save the JSON output if an audit artifact
   is needed.
2. Open each `drifted` row's live source and confirm the changed wording.
3. Re-quote the current passage, update its `date_checked` (and any relevant
   version or commit metadata), then rerun the check.
4. If a row has a `history` field, retain the previous quote there. The current
   register has no `history` field, so record prior wording in the project's
   normal review/change record rather than inventing a new row field.
5. Investigate `unreachable` rows separately; do not replace a source quote
   solely because the page was temporarily unavailable.
