/**
 * An orchestrator runs in the live project root without a sandbox, so what confines it is its guard's
 * write roots. Every adapter that accepts the orchestrator role refuses roots that are not confined to
 * a folder inside the checkout, through this one check.
 */

/** Why a write root does not confine an orchestrator, or undefined when it does. */
export function orchestratorWriteRootProblem(root: string, runtimeLabel: string): string | undefined {
  const slashed = root.replaceAll("\\", "/");
  const segments = slashed.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (slashed.startsWith("/") || /^[a-zA-Z]:/.test(slashed) || segments.includes("..")) {
    return `${runtimeLabel} orchestrator guard write root "${root}" is outside the mission checkout; declare roots inside the worker root`;
  }
  if (segments.length === 0) {
    return `${runtimeLabel} orchestrator guard write root "${root}" covers the whole repository; declare the roots the orchestrator writes, for example [out]`;
  }
  return undefined;
}

/** Throws for the first write root that does not confine an orchestrator to a folder inside the checkout. */
export function assertOrchestratorWriteRoots(roots: readonly string[], runtimeLabel: string): void {
  for (const root of roots) {
    const problem = orchestratorWriteRootProblem(root, runtimeLabel);
    if (problem) throw new Error(problem);
  }
}
