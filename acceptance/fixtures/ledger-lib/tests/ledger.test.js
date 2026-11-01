import assert from "node:assert/strict";
import test from "node:test";
import { addEntry, formatReport } from "../src/ledger.js";

const invoice = { date: "2026-01-04", description: "Invoice 101", amount: 400 };
const hosting = { date: "2026-01-27", description: "Hosting", amount: -90 };

test("addEntry appends a copy of the entry and leaves the input ledger untouched", () => {
  const ledger = [];
  const next = addEntry(ledger, invoice);
  assert.deepEqual(next, [invoice]);
  assert.deepEqual(ledger, []);
  assert.notEqual(next[0], invoice);
});

test("addEntry keeps entries in the order they were added", () => {
  const ledger = addEntry(addEntry([], invoice), hosting);
  assert.deepEqual(
    ledger.map((entry) => entry.description),
    ["Invoice 101", "Hosting"],
  );
});

test("addEntry rejects entries with a missing or malformed field", () => {
  assert.throws(() => addEntry([], { date: "2026-01-04", description: "  ", amount: 400 }), TypeError);
  assert.throws(() => addEntry([], { date: "01-04-2026", description: "Invoice 101", amount: 400 }), TypeError);
  assert.throws(() => addEntry([], { date: "2026-01-04", description: "Invoice 101", amount: "400" }), TypeError);
  assert.throws(() => addEntry([], { date: "2026-01-04", description: "Invoice 101", amount: Number.NaN }), TypeError);
});

test("formatReport renders one aligned row per entry under a header", () => {
  const ledger = addEntry(addEntry([], invoice), hosting);
  const lines = formatReport(ledger).split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^DATE\s+DESCRIPTION\s+AMOUNT$/);
  assert.match(lines[1], /^2026-01-04\s+Invoice 101\s+400\.00$/);
  assert.match(lines[2], /^2026-01-27\s+Hosting\s+-90\.00$/);
});

test("formatReport of an empty ledger is the header alone", () => {
  assert.match(formatReport([]), /^DATE\s+DESCRIPTION\s+AMOUNT$/);
});
