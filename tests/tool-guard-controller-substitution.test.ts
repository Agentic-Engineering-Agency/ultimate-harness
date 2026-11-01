import { describe, expect, test } from "vitest";
import { decideToolCall } from "../src/harness/tool-guard.js";
import { resolveToolGuardPolicy } from "../src/schema/runtime-control.js";

/**
 * #260: the orchestrator role may run `uh` commands, and a command that passes the controller check skips every other
 * guard rule. The check refused chaining (`;`, `&`, `|`), redirection and backticks, but not `$(...)`:
 * `uh mission run m1 $(git push)` ran the substitution unexamined, and PowerShell also evaluates `(...)` and `{...}`
 * outside quotes. A controller command may contain none of `$`, `(`, `)`, `{`, `}` outside quotes.
 */
const ROOT = process.platform === "win32" ? "C:\work\checkout" : "/work/checkout";
const policy = resolveToolGuardPolicy({});
const verdict = (command: string) => decideToolCall(policy, "bash", { command }, ROOT, { allowControllerCommands: true }).deny?.class;

describe("controller commands", () => {
  test.each([
    "uh mission run m1",
    "uh mission run m1 --runtime hermes",
    "uh mission run 'literal $(not run)'",
    "uh mission run m1 --note 'costs $5'",
    "uh steer run1 \"switch to the auth path (not the old one)\"",
    "uh mission run m1 --note 'a {b} and (c)'",
  ])("%s is the controller's own command and is allowed", command => {
    expect(verdict(command)).toBeUndefined();
  });

  test.each([
    "uh mission run m1 $(date)",
    "uh mission run m1 $(echo x)",
    "uh mission run \"$(echo x)\"",
    "uh mission run m1 ${RUNTIME}",
    "uh mission run m1 $RUNTIME",
    "uh mission run m1 $env:RUNTIME",
    "uh mission run m1 `echo x`",
    "uh mission run m1 --note \"costs $5\"",
    "uh ps (Get-Content secret.txt)",
    "uh ps { Remove-Item -Recurse . }",
    "uh mission run m1 --runtime (Get-Runtime)",
  ])("%s is expanded by the shell, so it gets no controller exemption", command => {
    expect(verdict(command)).toBe("agent_client");
  });
});
