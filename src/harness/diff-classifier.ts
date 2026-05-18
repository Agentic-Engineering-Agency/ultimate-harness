/**
 * UH-55 — TDD diff classifier.
 *
 * Pure helper that walks the captured `diff.patch` text, extracts every
 * touched file path, and categorizes each path as `tests` (matches the
 * mission's `tdd.test_paths`), `source` (matches `tdd.source_paths`),
 * or `other` (neither). No filesystem access; deterministic, side-effect
 * free. Used by `verify.ts` to gate test-first discipline.
 */

export interface ClassifyDiffOptions {
  test_paths: readonly string[];
  source_paths: readonly string[];
}

export interface ClassifyDiffResult {
  tests: string[];
  source: string[];
  other: string[];
  /** Every distinct path discovered in the diff, in encounter order. */
  paths: string[];
}

/**
 * Convert a single glob to a RegExp. Supported tokens:
 *   - `**`  matches any path (zero or more segments, including separators)
 *   - `*`   matches any character except `/`
 *   - `?`   matches one character except `/`
 *   - everything else is literal (regex-escaped)
 *
 * Anchored at both ends. Case-sensitive. POSIX-style separators.
 */
export function globToRegExp(glob: string): RegExp {
  let pattern = "^";
  let i = 0;
  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        // `**` matches zero or more path segments. When followed by a
        // separator (the canonical `**/` form) emit an optional
        // directory prefix that preserves the slash boundary so
        // `**/__tests__/**` does NOT match `foo__tests__` inside a
        // single segment.
        if (glob[i + 2] === "/") {
          pattern += "(?:.*/)?";
          i += 3;
          continue;
        }
        // Trailing `**` or `**` mid-path: match any run of chars
        // (including separators) so e.g. `src/**` matches the whole
        // subtree.
        pattern += ".*";
        i += 2;
        continue;
      }
      pattern += "[^/]*";
      i += 1;
      continue;
    }
    if (c === "?") {
      pattern += "[^/]";
      i += 1;
      continue;
    }
    if ("\\^$+.()|{}[]".includes(c)) {
      pattern += "\\" + c;
      i += 1;
      continue;
    }
    pattern += c;
    i += 1;
  }
  pattern += "$";
  return new RegExp(pattern);
}

function matchesAny(path: string, patterns: readonly RegExp[]): boolean {
  for (const re of patterns) {
    if (re.test(path)) return true;
  }
  return false;
}

// Path-bearing diff headers come in two flavors: bare (`a/foo.ts`) and
// C-quoted (`"a/foo with space.ts"`). Git uses C-quoting whenever a path
// contains spaces, control chars, double quotes, backslashes, or
// non-ASCII bytes (under default `core.quotePath`). We accept both and
// run a C-style unquoter on the captured value before classification.
const PATH_TOKEN = String.raw`(?:"((?:[^"\\]|\\.)*)"|(\S+))`;
const DIFF_HEADER_RE = new RegExp(`^diff --git ${PATH_TOKEN} ${PATH_TOKEN}$`);
const PLUSPLUSPLUS_RE = new RegExp(`^\\+\\+\\+ ${PATH_TOKEN}$`);
const MINUSMINUSMINUS_RE = new RegExp(`^--- ${PATH_TOKEN}$`);
const RENAME_TO_RE = /^rename to (.+)$/;
const RENAME_FROM_RE = /^rename from (.+)$/;

/**
 * Unquote a C-style git path. Drops the surrounding `"..."` if present
 * and decodes `\\`, `\"`, `\t`, `\n`, `\r`, and `\NNN` octals. Returns
 * the original string when no quoting is present.
 */
function unquoteGitPath(raw: string): string {
  if (!raw.startsWith('"') || !raw.endsWith('"')) return raw;
  const inner = raw.slice(1, -1);
  let out = "";
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (ch !== "\\") { out += ch; continue; }
    const next = inner[i + 1];
    if (next === undefined) { out += "\\"; break; }
    if (next === '"' || next === "\\") { out += next; i += 1; continue; }
    if (next === "t") { out += "\t"; i += 1; continue; }
    if (next === "n") { out += "\n"; i += 1; continue; }
    if (next === "r") { out += "\r"; i += 1; continue; }
    if (next >= "0" && next <= "7") {
      // Up to three octal digits (`\NNN`) — drained even when shorter.
      let j = i + 1;
      let octal = "";
      while (j < inner.length && j - i <= 3 && inner[j] >= "0" && inner[j] <= "7") {
        octal += inner[j];
        j += 1;
      }
      out += String.fromCharCode(parseInt(octal, 8));
      i = j - 1;
      continue;
    }
    // Unknown escape: pass through literally.
    out += next;
    i += 1;
  }
  return out;
}

/**
 * Strip the conventional `a/` or `b/` prefix from a parsed diff path.
 * Both prefixes are git defaults and are not part of the working tree.
 */
function stripDiffPrefix(p: string): string {
  if (p.startsWith("a/")) return p.slice(2);
  if (p.startsWith("b/")) return p.slice(2);
  return p;
}

function pickToken(quoted: string | undefined, bare: string | undefined): string | undefined {
  if (quoted !== undefined) return stripDiffPrefix(unquoteGitPath(`"${quoted}"`));
  if (bare !== undefined) return stripDiffPrefix(bare);
  return undefined;
}

/**
 * Extract every unique file path the diff touches. Handles standard
 * `diff --git`, `--- a/…` / `+++ b/…`, and `rename from/to` headers.
 * `/dev/null` references (additions/deletions) are skipped from that
 * side; the surviving side wins.
 */
export function extractDiffPaths(diff: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  const lines = diff.split(/\r?\n/);
  let current: { a?: string; b?: string } = {};

  const flush = (): void => {
    const pick = current.b && current.b !== "/dev/null"
      ? current.b
      : current.a && current.a !== "/dev/null"
        ? current.a
        : null;
    if (pick && !seen.has(pick)) {
      seen.add(pick);
      ordered.push(pick);
    }
    current = {};
  };

  for (const line of lines) {
    const header = DIFF_HEADER_RE.exec(line);
    if (header) {
      flush();
      current.a = pickToken(header[1], header[2]);
      current.b = pickToken(header[3], header[4]);
      continue;
    }
    const minus = MINUSMINUSMINUS_RE.exec(line);
    if (minus) {
      current.a = pickToken(minus[1], minus[2]);
      continue;
    }
    const plus = PLUSPLUSPLUS_RE.exec(line);
    if (plus) {
      current.b = pickToken(plus[1], plus[2]);
      continue;
    }
    const renameTo = RENAME_TO_RE.exec(line);
    if (renameTo) {
      current.b = renameTo[1];
      continue;
    }
    const renameFrom = RENAME_FROM_RE.exec(line);
    if (renameFrom) {
      current.a = renameFrom[1];
      continue;
    }
  }
  flush();
  return ordered;
}

/**
 * Classify every path in `diff` against the mission's TDD path globs.
 * A path that matches a test glob is `tests`; otherwise a path that
 * matches a source glob is `source`; otherwise `other`. Test globs win
 * over source globs by design — a file like `src/foo.test.ts` should
 * count as a test even though `src/**` also matches.
 */
export function classifyDiff(diff: string, options: ClassifyDiffOptions): ClassifyDiffResult {
  const testRes = options.test_paths.map(globToRegExp);
  const sourceRes = options.source_paths.map(globToRegExp);
  const tests: string[] = [];
  const source: string[] = [];
  const other: string[] = [];
  const paths = extractDiffPaths(diff);
  for (const path of paths) {
    if (matchesAny(path, testRes)) {
      tests.push(path);
      continue;
    }
    if (matchesAny(path, sourceRes)) {
      source.push(path);
      continue;
    }
    other.push(path);
  }
  return { tests, source, other, paths };
}
