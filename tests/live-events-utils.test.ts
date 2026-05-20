/**
 * UH-94 — pure helpers backing LiveEventsPane and live event hooks.
 */
import { describe, test, expect } from "vitest";
import {
  appendLiveEvent,
  classifyEventSeverity,
  eventLabel,
  isRunLiveStatus,
  isUsageEvent,
  LIVE_EVENTS_CAP,
  parseEventData,
  runEventsStreamPath,
  severityRowClass,
  shouldAutoScrollBottom,
  shouldAutoScrollTop,
} from "../apps/hermes-plugin/dashboard/src/live-events-utils.js";

describe("runEventsStreamPath", () => {
  test("builds mission-scoped stream URL", () => {
    expect(runEventsStreamPath("demo", "run-1")).toBe(
      "/missions/demo/runs/run-1/events?stream=1",
    );
  });
  test("escapes ids", () => {
    expect(runEventsStreamPath("M 1", "run/abc")).toBe(
      "/missions/M%201/runs/run%2Fabc/events?stream=1",
    );
  });
});

describe("parseEventData", () => {
  test("parses JSON object", () => {
    expect(parseEventData('{"event":"runtime.started"}')).toEqual({ event: "runtime.started" });
  });
  test("returns null for invalid JSON", () => {
    expect(parseEventData("not-json")).toBeNull();
  });
});

describe("eventLabel", () => {
  test("prefers event, then kind, then type", () => {
    expect(eventLabel({ event: "a", kind: "b", type: "c" })).toBe("a");
    expect(eventLabel({ kind: "b", type: "c" })).toBe("b");
    expect(eventLabel({ type: "c" })).toBe("c");
  });
});

describe("classifyEventSeverity", () => {
  test("explicit severity wins", () => {
    expect(classifyEventSeverity({ severity: "warn" }, "")).toBe("warn");
  });
  test("infers from event label", () => {
    expect(classifyEventSeverity({ event: "runtime.failed" }, "")).toBe("error");
    expect(classifyEventSeverity({ event: "needs-attention" }, "")).toBe("warn");
  });
  test("falls back to line heuristics", () => {
    expect(classifyEventSeverity(null, "something failed badly")).toBe("error");
    expect(classifyEventSeverity(null, "all good")).toBe("info");
  });
});

describe("isUsageEvent", () => {
  test("detects usage-like labels and fields", () => {
    expect(isUsageEvent({ event: "codex.usage" })).toBe(true);
    expect(isUsageEvent({ input_tokens: 100 })).toBe(true);
    expect(isUsageEvent({ event: "runtime.started" })).toBe(false);
  });
});

describe("appendLiveEvent", () => {
  test("caps at LIVE_EVENTS_CAP", () => {
    let events: ReturnType<typeof appendLiveEvent>["events"] = [];
    let nextId = 0;
    for (let i = 0; i < LIVE_EVENTS_CAP + 10; i += 1) {
      const out = appendLiveEvent(events, JSON.stringify({ seq: i }), nextId);
      events = out.events;
      nextId = out.nextId;
    }
    expect(events).toHaveLength(LIVE_EVENTS_CAP);
    expect(events[0]?.raw?.seq).toBe(10);
    expect(events.at(-1)?.raw?.seq).toBe(LIVE_EVENTS_CAP + 9);
  });

  test("assigns severity and usage flags", () => {
    const { events } = appendLiveEvent([], JSON.stringify({ event: "codex.usage" }), 0);
    expect(events[0]?.isUsage).toBe(true);
    expect(events[0]?.severity).toBe("info");
  });
});

describe("severityRowClass", () => {
  test("maps severities to css modifiers", () => {
    expect(severityRowClass("error")).toBe(" is-error");
    expect(severityRowClass("warn")).toBe(" is-warn");
    expect(severityRowClass("info")).toBe("");
  });
});

describe("scroll lock helpers", () => {
  test("shouldAutoScrollTop when near top", () => {
    expect(shouldAutoScrollTop({ scrollTop: 0 })).toBe(true);
    expect(shouldAutoScrollTop({ scrollTop: 100 }, 24)).toBe(false);
  });
  test("shouldAutoScrollBottom when near bottom", () => {
    expect(shouldAutoScrollBottom({ scrollTop: 70, scrollHeight: 100, clientHeight: 30 })).toBe(true);
    expect(shouldAutoScrollBottom({ scrollTop: 0, scrollHeight: 100, clientHeight: 30 })).toBe(false);
  });
});

describe("isRunLiveStatus", () => {
  test("only running is live", () => {
    expect(isRunLiveStatus("running")).toBe(true);
    expect(isRunLiveStatus("passed")).toBe(false);
    expect(isRunLiveStatus(undefined)).toBe(false);
  });
});
