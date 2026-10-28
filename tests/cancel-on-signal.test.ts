import { describe, expect, test } from "vitest";
import { setTimeout as delay } from "node:timers/promises";
import { settleOnSignal } from "../src/harness/cancel-on-signal.js";

/**
 * #267: SIGTERM or SIGINT on `uh mission run` aborted the run and exited the same instant, before the runtime
 * process wrapper had written the terminal state of `runtime-control.json` and settled the live-run registry. The
 * plugin's cancel relies on that state. The exit now waits, for a bounded time, for the run to settle.
 */
describe("settleOnSignal", () => {
  test("the process exits only after the run's own settlement has finished", async () => {
    const events: string[] = [];
    const running = (async () => { await delay(60); events.push("settled"); })();
    await settleOnSignal({
      abort: () => events.push("abort"),
      finalize: () => events.push("finalize"),
      running: () => running,
      exit: (code) => events.push(`exit ${code}`),
      code: 143,
    });
    expect(events).toEqual(["abort", "finalize", "settled", "exit 143"]);
  });

  test("a run that never settles does not hold the process: it exits after the bound", async () => {
    const events: string[] = [];
    const started = Date.now();
    await settleOnSignal({
      abort: () => events.push("abort"),
      finalize: () => events.push("finalize"),
      running: () => new Promise(() => undefined),
      exit: (code) => events.push(`exit ${code}`),
      code: 130,
      boundMs: 80,
    });
    expect(events).toEqual(["abort", "finalize", "exit 130"]);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("a run that settles with an error, and a run that is not known yet, still exit", async () => {
    const exits: number[] = [];
    await settleOnSignal({ abort: () => undefined, finalize: () => undefined, running: () => Promise.reject(new Error("boom")), exit: (code) => exits.push(code), code: 143 });
    await settleOnSignal({ abort: () => undefined, finalize: () => undefined, running: () => undefined, exit: (code) => exits.push(code), code: 143 });
    expect(exits).toEqual([143, 143]);
  });
});
