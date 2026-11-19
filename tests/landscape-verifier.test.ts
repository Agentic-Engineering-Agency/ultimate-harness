import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

type RunResult = { status: number; stdout: string };

const script = resolve(process.cwd(), "scripts/landscape/verify-register.mjs");
const fixtureDir = resolve(process.cwd(), "tests/fixtures/landscape");
const quote = "A durable worker register supports monthly freshness checks for every captured source.";

function fixtureUrl(name: string): string {
  return `https://fixtures.test/${name}`;
}

function runVerifier(registerPath: string, ...args: string[]): RunResult {
  try {
    return {
      status: 0,
      stdout: execFileSync(process.execPath, [script, "--register", registerPath, ...args], {
        encoding: "utf8",
      }),
    };
  } catch (error) {
    const processError = error as NodeJS.ErrnoException & { status?: number; stdout?: Buffer | string };
    return {
      status: processError.status ?? -1,
      stdout: processError.stdout?.toString() ?? "",
    };
  }
}

describe("landscape register verifier", () => {
  let tempRoot: string;
  const registerPath = resolve(process.cwd(), "tests/fixtures/landscape/register.json");

  beforeEach(() => {
    tempRoot = mkdtempSync(resolve(tmpdir(), "uh-landscape-"));
  });

  afterEach(() => rmSync(tempRoot, { recursive: true, force: true }));

  it("classifies fixture rows, writes JSON, and reports the mixed exit code", () => {
    const jsonPath = resolve(tempRoot, "result.json");
    const run = runVerifier(
      registerPath,
      "--fixture-dir",
      fixtureDir,
      "--json",
      jsonPath,
      "--concurrency",
      "2",
    );

    expect(run.status).toBe(1);
    expect(run.stdout).toContain("verified Verified Tool https://fixtures.test/verified coverage=1.00");
    expect(run.stdout).toContain("drifted Drifted Tool https://fixtures.test/drifted coverage=0.00");
    expect(run.stdout).toContain("unreachable Unreachable Tool https://fixtures.test/unreachable coverage=0.00");
    expect(run.stdout).toContain("unverifiable Guide Tool orca://skills/test coverage=0.00");
    expect(run.stdout).toContain("landscape: verified 1 drifted 1 unreachable 1 unverifiable 1 of 4");

    const result = JSON.parse(readFileSync(jsonPath, "utf8")) as {
      rows: Array<{ system: string; state: string; coverage: number }>;
      summary: { verified: number; drifted: number; unreachable: number; unverifiable: number; total: number };
      exit_code: number;
    };
    expect(result.rows.map((row) => row.state)).toEqual(["verified", "drifted", "unreachable", "unverifiable"]);
    expect(result.rows[0].coverage).toBe(1);
    expect(result.summary).toEqual({ verified: 1, drifted: 1, unreachable: 1, unverifiable: 1, total: 4 });
    expect(result.exit_code).toBe(1);
  });

  it("maps unreachable-only results to exit code 2", () => {
    const run = runVerifier(registerPath, "--fixture-dir", fixtureDir, "--only", "unreachable");
    expect(run.status).toBe(2);
    expect(run.stdout).toContain("unreachable Unreachable Tool https://fixtures.test/unreachable coverage=0.00");
    expect(run.stdout).toContain("landscape: verified 0 drifted 0 unreachable 1 unverifiable 0 of 1");
  });

  it("maps clean filtered results to exit code 0", () => {
    const run = runVerifier(registerPath, "--fixture-dir", fixtureDir, "--only", "verified");
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(
      "verified Verified Tool https://fixtures.test/verified coverage=1.00\n" +
        "landscape: verified 1 drifted 0 unreachable 0 unverifiable 0 of 1\n",
    );
  });
});

// Keep this helper in the test's fixture contract: fixture names are SHA-256
// URL hashes, the same stable naming rule used by the verifier.
expect(createHash("sha256").update(fixtureUrl("verified")).digest("hex")).toBe(
  "97c69ab0c031e0268881792e8662741d4ab82111d3378205f7693ec08964dfea",
);
