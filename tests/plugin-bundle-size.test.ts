/**
 * Hermes dashboard plugin bundle size guardrail (UH-61).
 *
 * The plugin loads at dashboard startup; bloating it past ~50 KB makes the
 * dashboard slow on first paint for users who have it installed. Drop a
 * dependency before raising this cap.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

const BUNDLE = path.resolve("apps/hermes-plugin/dashboard/dist/index.js");
const LIMIT_BYTES = 50 * 1024;

describe("hermes plugin bundle", () => {
  it("builds and stays under 50 KB", () => {
    if (!existsSync(BUNDLE)) {
      // Build on demand so the test can run on a clean checkout.
      execSync("bun apps/hermes-plugin/esbuild.config.mjs", { stdio: "inherit" });
    }
    expect(existsSync(BUNDLE), `expected bundle at ${BUNDLE}`).toBe(true);
    const size = statSync(BUNDLE).size;
    expect(size, `bundle size ${size} > ${LIMIT_BYTES}`).toBeLessThanOrEqual(LIMIT_BYTES);
  });
});
