import { describe, expect, test } from "vitest";
import path from "node:path";
import { harnessOwnerRoot, hasMainCheckout, mainCheckoutRoot } from "../src/harness/hive-root.js";

/**
 * #265: any `.harness` segment anywhere above a path made the directory above it the owner, so a project that lives
 * under a `.harness` folder (a home-directory `~/.harness/projects/x`) resolved to the wrong owner, and so did a path
 * spelled with another case on a case-sensitive system. Only the layouts UH itself creates for workers count.
 */
const at = (...parts: string[]) => path.resolve(path.sep, ...parts);

describe("mainCheckoutRoot", () => {
  test("a team worker worktree and a sandbox resolve to the project that owns them", () => {
    expect(mainCheckoutRoot(at("work", "p", ".harness", "missions", "team-a", "team", "workers", "backend"))).toBe(at("work", "p"));
    expect(mainCheckoutRoot(at("work", "p", ".harness", "sandboxes", "s1", "worktree"))).toBe(at("work", "p"));
    // A worker's own nested `.harness` (its run records) still points at the outermost project.
    expect(mainCheckoutRoot(at("work", "p", ".harness", "missions", "t", "team", "artifacts", "r1", "workers", "w", ".harness", "missions", "m", "runs", "r"))).toBe(at("work", "p"));
  });

  test("a project that sits under a .harness folder is its own owner", () => {
    const project = at("home", "u", ".harness", "projects", "x");
    expect(mainCheckoutRoot(project)).toBeUndefined();
    expect(harnessOwnerRoot(project)).toBe(project);
    expect(hasMainCheckout(project)).toBe(false);
    // And a worker of that project resolves to the project, not to the home directory.
    expect(mainCheckoutRoot(path.join(project, ".harness", "missions", "t", "team", "workers", "w"))).toBe(project);
  });

  test("a plain .harness path that is not a worker layout is not a worker", () => {
    expect(mainCheckoutRoot(at("work", "p", ".harness", "ledger"))).toBeUndefined();
    expect(mainCheckoutRoot(at("work", "p", ".harness", "missions", "m1", "runs", "r1"))).toBeUndefined();
  });

  test.skipIf(process.platform === "win32")("the folder name is matched exactly where the file system is case-sensitive", () => {
    expect(mainCheckoutRoot(at("work", "p", ".HARNESS", "missions", "t", "team", "workers", "w"))).toBeUndefined();
  });

  test.skipIf(process.platform !== "win32")("the folder name is matched without regard to case on Windows", () => {
    expect(mainCheckoutRoot(at("work", "p", ".HARNESS", "missions", "t", "team", "workers", "w"))).toBe(at("work", "p"));
  });
});
