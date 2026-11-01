import { afterEach, describe, expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { changedAcceptanceInputs, classifyAcceptance, computeAcceptanceInputDigest } from "../src/harness/acceptance.js";

const dirs: string[] = [];
afterEach(async () => { while (dirs.length > 0) await rm(dirs.pop() as string, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }); });

/**
 * #258: acceptance evidence whose inputs match no file could never go stale, and every status or rebind read each input
 * with its own `git show`. Evidence over inputs that match nothing is stale; inputs at a commit are read in one git process.
 */
const git = (cwd: string, ...args: string[]) => execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", ...args], { cwd, encoding: "utf-8" }).trim();
const identity = { runtime: "codex", model: "m" };

async function repo(fileCount: number) {
  const root = await mkdtemp(path.join(tmpdir(), "uh-accept-inputs-"));
  dirs.push(root);
  git(root, "init", "--quiet", "-b", "main");
  await mkdir(path.join(root, "src"), { recursive: true });
  for (let index = 0; index < fileCount; index += 1) await writeFile(path.join(root, "src", `f${index}.ts`), `export const v${index} = ${index};\n`);
  git(root, "add", "--all");
  git(root, "commit", "--quiet", "-m", "init");
  return { root, commit: git(root, "rev-parse", "HEAD") };
}

describe("acceptance inputs", () => {
  test("evidence over inputs that match no file is stale, and the reason names the patterns", async () => {
    const { root, commit } = await repo(2);
    const inputs = ["src/does-not-exist/**", "nowhere.ts"];
    const digest = await computeAcceptanceInputDigest(root, inputs, identity);
    expect(digest.resolved).toBe(0);
    const evidence = { outcome: "passed" as const, checked_at: new Date().toISOString(), harness_commit: commit, input_digest: digest.digest, runtime: identity.runtime, model: identity.model };
    const result = await classifyAcceptance(evidence, 30, new Date(), commit, { root, inputs });
    expect(result.state).toBe("stale");
    expect(result.reasons.join(" ")).toContain("src/does-not-exist/**");
  });

  test("inputs at a commit are read in one git process, not one per file", async () => {
    const { root, commit } = await repo(40);
    const trace = path.join(root, "git-trace.txt");
    const previous = process.env.GIT_TRACE;
    process.env.GIT_TRACE = trace;
    try {
      const digest = await computeAcceptanceInputDigest(root, ["src/**"], identity, { commit });
      expect(digest.resolved).toBe(40);
      await writeFile(path.join(root, "src", "f0.ts"), "export const v0 = 99;\n");
      expect(await changedAcceptanceInputs(root, ["src/**"], commit)).toEqual(["src/f0.ts"]);
    } finally {
      if (previous === undefined) delete process.env.GIT_TRACE; else process.env.GIT_TRACE = previous;
    }
    const gitRuns = (await readFile(trace, "utf8")).split(/\r?\n/).filter(line => /\bgit\b.*\b(show|cat-file)\b/.test(line) && /trace: (built-in|run_command|exec):/.test(line));
    expect(gitRuns.length).toBeLessThanOrEqual(4);
    // And the digest at the commit equals the digest of the same files on disk.
    git(root, "checkout", "--quiet", "--", "src");
    expect((await computeAcceptanceInputDigest(root, ["src/**"], identity)).digest).toBe((await computeAcceptanceInputDigest(root, ["src/**"], identity, { commit })).digest);
  });
});
