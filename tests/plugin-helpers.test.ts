/**
 * Pure-helper tests for the Hermes dashboard plugin TS bundle.
 *
 * Covers:
 *   * ``adapterHealthBadge`` — three-state mapping for the overview tab,
 *     pinning the regression from PR #89 finding #4 (null/undefined check
 *     used to render green "OK").
 *   * ``extractTrailingJsonPayload`` — replaces the
 *     ``/\{[^{}]*\}\s*$/`` regex that couldn'\''t handle nested error
 *     envelopes (PR #89 finding #5).
 */
import { describe, it, expect } from "vitest";
import { adapterHealthBadge, type AdapterCheck } from "../apps/hermes-plugin/dashboard/src/adapterHealth.js";
import { extractTrailingJsonPayload } from "../apps/hermes-plugin/dashboard/src/errorPayload.js";

describe("adapterHealthBadge", () => {
  it("maps ok=true to the green default variant", () => {
    const badge = adapterHealthBadge({ ok: true, version: "0.14.2" } as AdapterCheck);
    expect(badge.variant).toBe("default");
    expect(badge.label).toBe("OK");
  });

  it("maps ok=false to the red destructive variant", () => {
    const badge = adapterHealthBadge({ ok: false, error: "binary missing" } as AdapterCheck);
    expect(badge.variant).toBe("destructive");
    expect(badge.label).toBe("fail");
    expect(badge.title).toBe("binary missing");
  });

  it("maps null to the gray outline 'unknown' badge", () => {
    const badge = adapterHealthBadge(null);
    expect(badge.variant).toBe("outline");
    expect(badge.label).toBe("?");
  });

  it("maps undefined to the gray outline 'unknown' badge", () => {
    const badge = adapterHealthBadge(undefined as unknown as AdapterCheck);
    expect(badge.variant).toBe("outline");
    expect(badge.label).toBe("?");
  });

  it("never falsely paints unknown adapters green", () => {
    // The regression PR #89 finding #4 was specifically that ``a.check?.ok !== false``
    // returned ``true`` for ``null``/``undefined``. Pin that.
    for (const value of [null, undefined]) {
      const badge = adapterHealthBadge(value as AdapterCheck);
      expect(badge.variant).not.toBe("default");
      expect(badge.label).not.toBe("OK");
    }
  });
});

describe("extractTrailingJsonPayload", () => {
  it("returns undefined for empty input", () => {
    expect(extractTrailingJsonPayload("")).toBeUndefined();
  });

  it("returns undefined when no JSON object is present", () => {
    expect(extractTrailingJsonPayload("HTTP 500: oops")).toBeUndefined();
  });

  it("parses a flat error envelope", () => {
    const parsed = extractTrailingJsonPayload(
      'HTTP 400: {"error":"invalid","code":"invalid_id"}'
    ) as { error: string; code: string } | undefined;
    expect(parsed?.error).toBe("invalid");
    expect(parsed?.code).toBe("invalid_id");
  });

  it("parses an envelope with a nested ``fields`` object (regression for PR #89 finding #5)", () => {
    const body = '{"error":"validation","code":"invalid_field","fields":{"id":"required","name":"too short"}}';
    const parsed = extractTrailingJsonPayload(`HTTP 400: ${body}`) as
      | { error: string; code: string; fields: Record<string, string> }
      | undefined;
    expect(parsed).toBeDefined();
    expect(parsed?.fields.id).toBe("required");
    expect(parsed?.fields.name).toBe("too short");
  });

  it("parses an envelope with deeply nested objects", () => {
    const body = '{"error":"e","code":"c","details":{"runtime":{"kind":"hermes","caps":["a","b"]}}}';
    const parsed = extractTrailingJsonPayload(body) as
      | { details: { runtime: { kind: string; caps: string[] } } }
      | undefined;
    expect(parsed?.details.runtime.kind).toBe("hermes");
    expect(parsed?.details.runtime.caps).toEqual(["a", "b"]);
  });

  it("ignores embedded objects that aren'\''t at the tail", () => {
    // Without a trailing ``}``, the candidate isn'\''t a JSON object — skip it.
    expect(extractTrailingJsonPayload("prefix {not json} suffix")).toBeUndefined();
  });

  it("skips stray opening braces and locks onto the real JSON object", () => {
    const body = 'foo { bar baz {"error":"e","code":"c"}';
    const parsed = extractTrailingJsonPayload(body) as
      | { error: string; code: string }
      | undefined;
    expect(parsed?.error).toBe("e");
    expect(parsed?.code).toBe("c");
  });
});
