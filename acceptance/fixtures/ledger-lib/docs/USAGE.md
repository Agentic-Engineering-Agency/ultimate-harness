# Usage

`ledger-lib` keeps a ledger as a plain array of entries. Every entry has three
fields:

| field | type | meaning |
| --- | --- | --- |
| `date` | string | `YYYY-MM-DD` the entry was booked |
| `description` | string | what the entry is for |
| `amount` | number | signed money: incoming is positive, outgoing is negative |

## addEntry(ledger, entry)

Returns a **new** ledger with `entry` appended. The ledger you pass in is never
modified, and the entry itself is copied, so later edits to the object you
passed in do not change the ledger.

```js
import { addEntry } from "./src/ledger.js";

let ledger = [];
ledger = addEntry(ledger, { date: "2026-01-04", description: "Invoice 101", amount: 400 });
ledger = addEntry(ledger, { date: "2026-01-27", description: "Hosting", amount: -90 });

ledger.length; // 2
```

An entry without a `description`, without a finite numeric `amount`, or with a
`date` that is not `YYYY-MM-DD` throws a `TypeError`.

## balance(ledger)

Sums the `amount` of every entry in the ledger and returns the running total.
An empty ledger balances at `0`.

```js
import { addEntry, balance } from "./src/ledger.js";

const ledger = addEntry(
  addEntry([], { date: "2026-01-04", description: "Invoice 101", amount: 400 }),
  { date: "2026-01-27", description: "Hosting", amount: -90 },
);

balance(ledger); // 310
```

Because amounts are signed, `balance` is the net position after all entries,
not the sum of the incoming ones.
