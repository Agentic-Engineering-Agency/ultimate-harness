import { expect, test } from "vitest";
import { mapBounded, mapResourceWaves, workerConcurrency } from "../src/harness/runtime-resources.js";
import { TeamResourceLimitsSchema } from "../src/schema/runtime-control.js";

test("worker admission respects aggregate memory headroom and fails before an unenforceable launch", () => {
  const limits = { max_parallel: 4, worker_memory_mb: 1024, reserve_memory_mb: 1024 };
  expect(workerConcurrency(8, limits, 3 * 1024 ** 3)).toBe(2);
  expect(() => workerConcurrency(8, limits, 1.5 * 1024 ** 3)).toThrow();
});

test("a failed worker stops queued admission but does not abandon an admitted sibling", async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const admitted: number[] = [];
  let settled = false;
  const pending = mapBounded([1, 2, 3], 2, async item => {
    admitted.push(item);
    if (item === 1) throw new Error("fixture failure");
    await gate;
    return item;
  });
  void pending.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();
  expect(admitted).toEqual([1, 2]);
  expect(settled).toBe(false);
  release();
  await expect(pending).rejects.toThrow();
  expect(admitted).toEqual([1, 2]);
});

test("cost reservations admit only affordable waves and release completed reservations", async () => {
  const admitted: number[] = [];
  const blocked: number[] = [];
  await mapResourceWaves([1, 2, 3, 4, 5], {
    max_parallel: 2, max_cost_usd: 5, worker_cost_reservation_usd: 2,
  }, async item => { admitted.push(item); return item; }, {
    costOf: async () => 1,
    blocked: async item => { blocked.push(item); return item; },
  });
  expect(admitted).toEqual([1, 2, 3, 4]);
  expect(blocked).toEqual([5]);
});

test("unknown completed spend stops later waves after all admitted siblings settle", async () => {
  const admitted: number[] = [];
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let blocked = false;
  const pending = mapResourceWaves([1, 2, 3], {
    max_parallel: 2, max_cost_usd: 10, worker_cost_reservation_usd: 1,
  }, async item => { admitted.push(item); if (item === 2) await gate; return item; }, {
    costOf: async () => undefined,
    blocked: async item => { blocked = true; return item; },
  });
  await Promise.resolve();
  expect(admitted).toEqual([1, 2]);
  expect(blocked).toBe(false);
  release();
  await pending;
  expect(admitted).toEqual([1, 2]);
  expect(blocked).toBe(true);
});

test("memory headroom is rechecked before the next wave", async () => {
  let available = 3 * 1024 ** 3;
  const admitted: number[] = [];
  const blocked: number[] = [];
  await mapResourceWaves([1, 2, 3], { max_parallel: 2, worker_memory_mb: 1024, reserve_memory_mb: 1024 },
    async item => { admitted.push(item); available = 1024 ** 3; return item; }, {
      availableBytes: () => available,
      costOf: async () => { throw new Error("Cost must not be guessed when no cost policy is configured"); },
      blocked: async item => { blocked.push(item); return item; },
    });
  expect(admitted).toEqual([1, 2]);
  expect(blocked).toEqual([3]);
});

/* ------------------------------------------------- unknown-cost admission policy */

test("unknown_cost defaults to block so an unknown completed cost still refuses further paid admission", async () => {
  expect(TeamResourceLimitsSchema.parse({}).unknown_cost).toBe("block");
  const admitted: number[] = [];
  const blocked: number[] = [];
  const notes: string[] = [];
  await mapResourceWaves([1, 2, 3], { max_parallel: 2, max_cost_usd: 10, worker_cost_reservation_usd: 1 },
    async item => { admitted.push(item); return item; }, {
      costOf: async () => undefined,
      blocked: async item => { blocked.push(item); return item; },
      onAdmission: note => { notes.push(note); },
    });
  expect(admitted).toEqual([1, 2]);
  expect(blocked).toEqual([3]);
  expect(notes).toEqual([]);
});

test("unknown_cost=admit lets later waves proceed and records one explicit note per admitted wave", async () => {
  const admitted: number[] = [];
  const blocked: number[] = [];
  const notes: string[] = [];
  await mapResourceWaves([1, 2, 3, 4, 5], {
    max_parallel: 2, max_cost_usd: 10, worker_cost_reservation_usd: 1, unknown_cost: "admit",
  }, async item => { admitted.push(item); return item; }, {
    costOf: async () => undefined,
    blocked: async item => { blocked.push(item); return item; },
    onAdmission: note => { notes.push(note); },
  });
  expect(admitted).toEqual([1, 2, 3, 4, 5]);
  expect(blocked).toEqual([]);
  expect(notes).toEqual([
    "wave 2 admitted with unknown cost by policy unknown_cost=admit",
    "wave 3 admitted with unknown cost by policy unknown_cost=admit",
  ]);
});

test("an unknown cost is only carried forward for the wave that reported it", async () => {
  const notes: string[] = [];
  let settled = 0;
  await mapResourceWaves([1, 2, 3, 4, 5, 6], {
    max_parallel: 2, max_cost_usd: 100, worker_cost_reservation_usd: 1, unknown_cost: "admit",
  }, async item => item, {
    // Wave 1 leaves unknown spend; wave 2's known costs must still close the budget.
    costOf: async () => (++settled <= 2 ? undefined : 1),
    blocked: async item => item,
    onAdmission: note => { notes.push(note); },
  });
  expect(notes).toEqual(["wave 2 admitted with unknown cost by policy unknown_cost=admit"]);
});

test("under unknown_cost=admit known completed costs still count against max_cost_usd", async () => {
  const admitted: number[] = [];
  const blocked: number[] = [];
  const notes: string[] = [];
  await mapResourceWaves([1, 2, 3, 4], {
    max_parallel: 2, max_cost_usd: 3, worker_cost_reservation_usd: 1, unknown_cost: "admit",
  }, async item => { admitted.push(item); return item; }, {
    costOf: async () => 1.5,
    blocked: async item => { blocked.push(item); return item; },
    onAdmission: note => { notes.push(note); },
  });
  expect(admitted).toEqual([1, 2]);
  expect(blocked).toEqual([3, 4]);
  expect(notes).toEqual([]);
});

test("unknown costs are never treated as zero: known costs in the same wave still exhaust the budget", async () => {
  const admitted: number[] = [];
  const blocked: number[] = [];
  const notes: string[] = [];
  await mapResourceWaves([1, 2, 3, 4], {
    max_parallel: 2, max_cost_usd: 3, worker_cost_reservation_usd: 1, unknown_cost: "admit",
  }, async item => { admitted.push(item); return item; }, {
    costOf: async item => (item === 2 ? undefined : 1.5),
    blocked: async item => { blocked.push(item); return item; },
    onAdmission: note => { notes.push(note); },
  });
  expect(admitted).toEqual([1, 2, 3]);
  expect(blocked).toEqual([4]);
  expect(notes).toEqual(["wave 2 admitted with unknown cost by policy unknown_cost=admit"]);
});
