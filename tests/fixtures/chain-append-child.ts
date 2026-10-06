// Child process for the parallel-append tests: appends `count` chained records to the hive facts or the
// intervention ledger of `root`, so several of these race the way parallel queue runs and team workers do.
import { appendFact } from "../../src/harness/hive.js";
import { recordIntervention } from "../../src/harness/interventions.js";

const [mode, root, count, tag, ref, sha256] = process.argv.slice(2);
const total = Number(count);
for (let index = 0; index < total; index += 1) {
  if (mode === "facts") {
    appendFact(root, { text: `fact ${tag}-${index}`, evidence: { kind: "verification", ref, sha256 }, source: "manual" });
  } else {
    await recordIntervention(root, { source: "orchestrator", trigger: "steer", what: `intervention ${tag}-${index}` });
  }
}
