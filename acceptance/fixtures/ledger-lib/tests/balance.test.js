import assert from "node:assert/strict";
import test from "node:test";
import { addEntry, balance } from "../src/ledger.js";

const january = { date: "2026-01-04", description: "Invoice 101", amount: 400 };
const hosting = { date: "2026-01-27", description: "Hosting", amount: -90 };
const february = { date: "2026-02-03", description: "Invoice 102", amount: 250 };

test("balance adds up every entry in the ledger", () => {
  assert.equal(balance([january, hosting, february]), 560);
});

test("balance counts the entry that was added last", () => {
  const ledger = addEntry(addEntry(addEntry([], january), hosting), february);
  assert.equal(balance(ledger), 560);
});

test("balance of a single-entry ledger is that entry's amount", () => {
  assert.equal(balance([january]), 400);
});

test("balance of an empty ledger is zero", () => {
  assert.equal(balance([]), 0);
});

test("balance keeps the sign of withdrawals", () => {
  assert.equal(balance([{ date: "2026-03-14", description: "Refund", amount: -25 }]), -25);
});
