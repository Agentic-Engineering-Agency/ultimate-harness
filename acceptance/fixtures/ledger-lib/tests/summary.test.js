import assert from "node:assert/strict";
import test from "node:test";
import { monthlySummary } from "../src/summary.js";

const januaryInvoice = { date: "2026-01-04", description: "Invoice 101", amount: 400 };
const januaryHosting = { date: "2026-01-27", description: "Hosting", amount: -90 };
const februaryInvoice = { date: "2026-02-03", description: "Invoice 102", amount: 250 };
const februaryRefund = { date: "2026-02-14", description: "Refund", amount: -25 };
const marchInvoice = { date: "2026-03-01", description: "Invoice 103", amount: 120 };

const ledger = [januaryInvoice, januaryHosting, februaryInvoice, februaryRefund, marchInvoice];

test("monthlySummary reports the signed total of each month", () => {
  assert.deepEqual(monthlySummary(ledger), [
    { month: "2026-01", total: 310 },
    { month: "2026-02", total: 225 },
    { month: "2026-03", total: 120 },
  ]);
});

test("monthlySummary lists months in chronological order whatever order the entries are in", () => {
  const unordered = [marchInvoice, januaryInvoice, februaryInvoice];
  assert.deepEqual(
    monthlySummary(unordered).map((row) => row.month),
    ["2026-01", "2026-02", "2026-03"],
  );
});

test("monthlySummary reports one row per month even when a month has several entries", () => {
  assert.deepEqual(monthlySummary([januaryInvoice, januaryHosting]), [{ month: "2026-01", total: 310 }]);
});

test("monthlySummary of an empty ledger is an empty array", () => {
  assert.deepEqual(monthlySummary([]), []);
});

test("monthlySummary keeps a month with only withdrawals negative", () => {
  assert.deepEqual(monthlySummary([januaryHosting]), [{ month: "2026-01", total: -90 }]);
});
