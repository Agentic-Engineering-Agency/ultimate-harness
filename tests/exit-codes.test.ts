import { describe, expect, test } from "vitest";
import {
  exitCodeForRun,
  EXIT_CODE_PASSED,
  EXIT_CODE_FAILED,
  EXIT_CODE_BLOCKED,
  EXIT_CODE_CANCELLED,
  EXIT_CODE_SIGNAL,
} from "../src/harness/exit-codes.js";

describe("exitCodeForRun", () => {
  test("constants adhere to terminal contract", () => {
    expect(EXIT_CODE_PASSED).toBe(0);
    expect(EXIT_CODE_FAILED).toBe(1);
    expect(EXIT_CODE_BLOCKED).toBe(2);
    expect(EXIT_CODE_CANCELLED).toBe(130);
    expect(EXIT_CODE_SIGNAL).toBe(143);
  });

  describe("passed outcomes", () => {
    test("returns 0 for passed status without stop code", () => {
      expect(exitCodeForRun("passed")).toBe(0);
      expect(exitCodeForRun("passed", undefined)).toBe(0);
      expect(exitCodeForRun("passed", null)).toBe(0);
    });

    test("returns 0 for passed status with empty stop code", () => {
      expect(exitCodeForRun("passed", "")).toBe(0);
    });
  });

  describe("cancelled outcomes", () => {
    test("returns 130 for cancelled status", () => {
      expect(exitCodeForRun("cancelled")).toBe(130);
      expect(exitCodeForRun("cancelled", undefined)).toBe(130);
      expect(exitCodeForRun("cancelled", null)).toBe(130);
    });

    test("returns 130 when stop_code is cancelled regardless of status", () => {
      expect(exitCodeForRun("failed", "cancelled")).toBe(130);
      expect(exitCodeForRun("running", "cancelled")).toBe(130);
      expect(exitCodeForRun("blocked", "cancelled")).toBe(130);
      expect(exitCodeForRun("passed", "cancelled")).toBe(130);
      expect(exitCodeForRun(undefined, "cancelled")).toBe(130);
      expect(exitCodeForRun(null, "cancelled")).toBe(130);
      expect(exitCodeForRun("", "cancelled")).toBe(130);
    });
  });

  describe("blocked outcomes", () => {
    test("returns 2 for blocked status", () => {
      expect(exitCodeForRun("blocked")).toBe(2);
      expect(exitCodeForRun("blocked", undefined)).toBe(2);
      expect(exitCodeForRun("blocked", null)).toBe(2);
    });

    test("returns 2 when stop_code is blocked", () => {
      expect(exitCodeForRun("failed", "blocked")).toBe(2);
      expect(exitCodeForRun(undefined, "blocked")).toBe(2);
      expect(exitCodeForRun(null, "blocked")).toBe(2);
    });

    test("returns 2 for blocked status with failure-like stop codes", () => {
      expect(exitCodeForRun("blocked", "policy")).toBe(2);
      expect(exitCodeForRun("blocked", "route_mismatch")).toBe(2);
      expect(exitCodeForRun("blocked", "route_unverified")).toBe(2);
    });
  });

  describe("failed outcomes", () => {
    test("returns 1 for failed status", () => {
      expect(exitCodeForRun("failed")).toBe(1);
      expect(exitCodeForRun("failed", undefined)).toBe(1);
      expect(exitCodeForRun("failed", null)).toBe(1);
    });

    test("returns 1 for failed status with various non-cancellation stop codes", () => {
      expect(exitCodeForRun("failed", "timeout")).toBe(1);
      expect(exitCodeForRun("failed", "stall")).toBe(1);
      expect(exitCodeForRun("failed", "deadline")).toBe(1);
      expect(exitCodeForRun("failed", "turn_limit")).toBe(1);
      expect(exitCodeForRun("failed", "output_limit")).toBe(1);
      expect(exitCodeForRun("failed", "repeated_failure")).toBe(1);
      expect(exitCodeForRun("failed", "denial_budget")).toBe(1);
      expect(exitCodeForRun("failed", "runtime_error")).toBe(1);
      expect(exitCodeForRun("failed", "controller_error")).toBe(1);
      expect(exitCodeForRun("failed", "controller_lost")).toBe(1);
      expect(exitCodeForRun("failed", "policy")).toBe(1);
    });

    test("returns 1 for missing, null, or empty arguments", () => {
      expect(exitCodeForRun()).toBe(1);
      expect(exitCodeForRun(undefined, undefined)).toBe(1);
      expect(exitCodeForRun(null, null)).toBe(1);
      expect(exitCodeForRun("", "")).toBe(1);
    });

    test("returns 1 for unknown status values", () => {
      expect(exitCodeForRun("running")).toBe(1);
      expect(exitCodeForRun("unknown")).toBe(1);
      expect(exitCodeForRun("error")).toBe(1);
      expect(exitCodeForRun("PASSED")).toBe(1);
    });
  });
});
