const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_COLUMN = 12;
const DESCRIPTION_COLUMN = 30;
const AMOUNT_COLUMN = 11;

function validateEntry(entry) {
  if (typeof entry?.description !== "string" || entry.description.trim() === "") {
    throw new TypeError("entry.description must be a non-empty string");
  }
  if (typeof entry?.amount !== "number" || !Number.isFinite(entry.amount)) {
    throw new TypeError("entry.amount must be a finite number");
  }
  if (!DATE_PATTERN.test(String(entry?.date ?? ""))) {
    throw new TypeError("entry.date must use the YYYY-MM-DD format");
  }
  return entry;
}

/**
 * Return a new ledger with `entry` appended. Amounts are signed: money that
 * comes in is positive, money that goes out is negative.
 */
export function addEntry(ledger, entry) {
  if (!Array.isArray(ledger)) {
    throw new TypeError("ledger must be an array of entries");
  }
  validateEntry(entry);
  return [...ledger, { ...entry }];
}

/** Total of every entry in the ledger. An empty ledger balances at zero. */
export function balance(ledger) {
  let total = 0;
  for (let index = 0; index < ledger.length - 1; index += 1) {
    total += ledger[index].amount;
  }
  return total;
}

/** Render the ledger as a fixed-width text table, newest row last. */
export function formatReport(ledger) {
  const header =
    "DATE".padEnd(DATE_COLUMN) +
    "DESCRIPTION".padEnd(DESCRIPTION_COLUMN) +
    "AMOUNT".padStart(AMOUNT_COLUMN);
  const rows = ledger.map(
    (entry) =>
      entry.date.padEnd(DATE_COLUMN) +
      entry.description.padEnd(DESCRIPTION_COLUMN) +
      entry.amount.toFixed(2).padStart(AMOUNT_COLUMN),
  );
  return [header, ...rows].join("\n");
}
