/**
 * `uh ledger confirm` records that the owner verified an intervention. An agent may never set that, so the command
 * is refused in any guarded run (the orchestrator role included: its policy marks it a controller, which is meant for
 * starting runs, not for the owner's sign-off) and in any process that has no terminal, where nobody is there to
 * confirm anything. The guard also denies the command to a worker's shell; this is the second line behind it.
 *
 * Every guarded worker's children inherit `UH_TOOL_GUARD_POLICY`, the path of the worker's guard policy, so the
 * variable being set marks a process started by a guarded worker whatever the command was spelled like.
 */
export function ownerOnlyRefusal(env: NodeJS.ProcessEnv, command: string[], interactive: boolean): string | undefined {
  if (command.join(" ") !== "ledger confirm") return undefined;
  if (env.UH_TOOL_GUARD_POLICY) {
    return "uh ledger confirm is the owner's: this process was started by a guarded worker (UH_TOOL_GUARD_POLICY is set), and an agent may never record an owner verification.";
  }
  if (!interactive) {
    return "uh ledger confirm needs the owner at a terminal: this process has no terminal, so nobody is here to confirm. Run it yourself from a terminal.";
  }
  return undefined;
}
