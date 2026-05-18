import { describe, test, expect } from "vitest";
import { classifyDiff, extractDiffPaths, globToRegExp } from "../src/harness/diff-classifier.js";

const SAMPLE = `diff --git a/src/foo.ts b/src/foo.ts
index 1111111..2222222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1 +1 @@
-old
+new
diff --git a/tests/foo.test.ts b/tests/foo.test.ts
index 3333333..4444444 100644
--- a/tests/foo.test.ts
+++ b/tests/foo.test.ts
@@ -1 +1 @@
-old test
+new test
diff --git a/docs/readme.md b/docs/readme.md
new file mode 100644
--- /dev/null
+++ b/docs/readme.md
@@ -0,0 +1 @@
+hello
`;

const TEST_PATHS = ["tests/**", "**/*.test.ts", "**/*.spec.ts"];
const SOURCE_PATHS = ["src/**"];

describe("diff-classifier globToRegExp", () => {
  test("`**` matches across path segments", () => {
    const re = globToRegExp("tests/**");
    expect(re.test("tests/foo.test.ts")).toBe(true);
    expect(re.test("tests/nested/dir/bar.ts")).toBe(true);
    expect(re.test("src/foo.ts")).toBe(false);
  });

  test("`*` matches within a single segment only", () => {
    const re = globToRegExp("src/*.ts");
    expect(re.test("src/foo.ts")).toBe(true);
    expect(re.test("src/nested/foo.ts")).toBe(false);
  });

  test("`**/*.test.ts` matches a deeply-nested test file", () => {
    const re = globToRegExp("**/*.test.ts");
    expect(re.test("foo.test.ts")).toBe(true);
    expect(re.test("a/b/c/foo.test.ts")).toBe(true);
    expect(re.test("foo.ts")).toBe(false);
  });

  test("regex metacharacters are escaped", () => {
    const re = globToRegExp("src/foo+.ts");
    expect(re.test("src/foo+.ts")).toBe(true);
    expect(re.test("src/fooo.ts")).toBe(false);
  });
});

describe("diff-classifier extractDiffPaths", () => {
  test("captures every distinct file in encounter order, preferring +++ side", () => {
    const paths = extractDiffPaths(SAMPLE);
    expect(paths).toEqual(["src/foo.ts", "tests/foo.test.ts", "docs/readme.md"]);
  });

  test("uses --- side when +++ is /dev/null (deletion)", () => {
    const diff = `diff --git a/src/dead.ts b/src/dead.ts
--- a/src/dead.ts
+++ /dev/null
`;
    expect(extractDiffPaths(diff)).toEqual(["src/dead.ts"]);
  });

  test("uses +++ side when --- is /dev/null (addition)", () => {
    const diff = `diff --git a/src/new.ts b/src/new.ts
--- /dev/null
+++ b/src/new.ts
`;
    expect(extractDiffPaths(diff)).toEqual(["src/new.ts"]);
  });

  test("handles rename hunks", () => {
    const diff = `diff --git a/old.ts b/renamed.ts
rename from old.ts
rename to renamed.ts
`;
    expect(extractDiffPaths(diff)).toEqual(["renamed.ts"]);
  });

  test("empty diff yields empty paths", () => {
    expect(extractDiffPaths("")).toEqual([]);
  });
});

describe("diff-classifier classifyDiff", () => {
  test("buckets tests, source, and other", () => {
    const r = classifyDiff(SAMPLE, { test_paths: TEST_PATHS, source_paths: SOURCE_PATHS });
    expect(r.tests).toEqual(["tests/foo.test.ts"]);
    expect(r.source).toEqual(["src/foo.ts"]);
    expect(r.other).toEqual(["docs/readme.md"]);
    expect(r.paths).toEqual(["src/foo.ts", "tests/foo.test.ts", "docs/readme.md"]);
  });

  test("test glob wins over source glob (src/foo.test.ts counts as test)", () => {
    const diff = `diff --git a/src/foo.test.ts b/src/foo.test.ts
--- a/src/foo.test.ts
+++ b/src/foo.test.ts
`;
    const r = classifyDiff(diff, { test_paths: TEST_PATHS, source_paths: SOURCE_PATHS });
    expect(r.tests).toEqual(["src/foo.test.ts"]);
    expect(r.source).toEqual([]);
  });

  test("source-only diff has empty tests bucket", () => {
    const diff = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
`;
    const r = classifyDiff(diff, { test_paths: TEST_PATHS, source_paths: SOURCE_PATHS });
    expect(r.tests).toEqual([]);
    expect(r.source).toEqual(["src/a.ts", "src/b.ts"]);
  });

  test("tests-only diff has empty source bucket", () => {
    const diff = `diff --git a/tests/a.test.ts b/tests/a.test.ts
--- a/tests/a.test.ts
+++ b/tests/a.test.ts
`;
    const r = classifyDiff(diff, { test_paths: TEST_PATHS, source_paths: SOURCE_PATHS });
    expect(r.tests).toEqual(["tests/a.test.ts"]);
    expect(r.source).toEqual([]);
  });
});


describe("diff-classifier reviewer-fixes", () => {
  test("`**/__tests__/**` does NOT match a same-segment substring (foo__tests__)", () => {
    const r = classifyDiff(
      [
        "diff --git a/src/foo__tests__/impl.ts b/src/foo__tests__/impl.ts",
        "--- a/src/foo__tests__/impl.ts",
        "+++ b/src/foo__tests__/impl.ts",
        "",
      ].join("\n"),
      { test_paths: ["**/__tests__/**"], source_paths: ["src/**"] },
    );
    expect(r.tests).toEqual([]);
    expect(r.source).toEqual(["src/foo__tests__/impl.ts"]);
  });

  test("`**/__tests__/**` matches a real __tests__ directory", () => {
    const r = classifyDiff(
      [
        "diff --git a/src/__tests__/impl.ts b/src/__tests__/impl.ts",
        "--- a/src/__tests__/impl.ts",
        "+++ b/src/__tests__/impl.ts",
        "",
      ].join("\n"),
      { test_paths: ["**/__tests__/**"], source_paths: ["src/**"] },
    );
    expect(r.tests).toEqual(["src/__tests__/impl.ts"]);
    expect(r.source).toEqual([]);
  });

  test("C-quoted diff paths (spaces) are unquoted and classified", () => {
    const r = classifyDiff(
      [
        "diff --git \"a/src/file with space.ts\" \"b/src/file with space.ts\"",
        "--- \"a/src/file with space.ts\"",
        "+++ \"b/src/file with space.ts\"",
        "",
      ].join("\n"),
      { test_paths: ["tests/**"], source_paths: ["src/**"] },
    );
    expect(r.source).toEqual(["src/file with space.ts"]);
  });

  test("C-quoted diff paths with escape sequences are unquoted", () => {
    const r = classifyDiff(
      [
        "diff --git \"a/src/tab\\there.ts\" \"b/src/tab\\there.ts\"",
        "--- \"a/src/tab\\there.ts\"",
        "+++ \"b/src/tab\\there.ts\"",
        "",
      ].join("\n"),
      { test_paths: ["tests/**"], source_paths: ["src/**"] },
    );
    expect(r.source).toEqual(["src/tab\there.ts"]);
  });
});

