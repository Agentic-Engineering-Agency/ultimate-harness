/**
 * UH-87 — Run modal prop wiring for replay mode.
 *
 * The modal component (`RunModal.tsx`) reads two pure helpers to decide
 * its title and banner; both live in `mission-compare-helpers.ts` so
 * vitest can pin them without mounting React. If a refactor breaks the
 * mapping, these tests fail before the modal does.
 */
import { describe, test, expect } from "vitest";
import {
  replayBannerText,
  runModalTitle,
} from "../apps/hermes-plugin/dashboard/src/mission-compare-helpers.js";

describe("runModalTitle", () => {
  test("returns 'Run <id>' when no replay_of is provided", () => {
    expect(runModalTitle("demo", undefined)).toBe("Run demo");
  });

  test("returns 'Replay <id>' when replay_of is provided", () => {
    expect(runModalTitle("demo", "20260520T120000Z-deadbe")).toBe("Replay demo");
  });

  test("empty replay_of is treated as not-replaying", () => {
    expect(runModalTitle("demo", "")).toBe("Run demo");
  });
});

describe("replayBannerText", () => {
  test("returns null when replay_of is missing", () => {
    expect(replayBannerText(undefined)).toBeNull();
    expect(replayBannerText("")).toBeNull();
  });

  test("renders the banner with the source run id", () => {
    expect(replayBannerText("run-a")).toBe("Replaying run run-a");
  });

  test("truncates long run ids to keep the banner compact", () => {
    const long = "20260520T120000Z-deadbeefcafebabe";
    const banner = replayBannerText(long);
    expect(banner).toBe("Replaying run 20260520T120000Z…");
  });
});