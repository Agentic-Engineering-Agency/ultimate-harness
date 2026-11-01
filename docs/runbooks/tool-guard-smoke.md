# Tool-guard smoke

Proves, through the built hook and OMP extension, that a resolved tool-guard policy denies a Git mutation and a protected-root write while allowing a read-only Git command. It also proves that both denials append newline-delimited records to the run log. The smoke does not invoke a model or a live runtime.

## What it runs

`scripts/smoke/tool-guard/run.mjs` creates a temporary worker root and writes a `uh.tool-guard.v0` policy with `write_roots: ["out"]`, Git/package/network denial enabled, the default agent-client list reduced to `omp`, and the default protected roots. It then:

1. starts the built Command Code hook with `UH_TOOL_GUARD_POLICY` and `UH_TOOL_GUARD_LOG`;
2. submits `shell_command` with `git commit -am x` and asserts a deny response;
3. submits `shell_command` with `git status T:/forbidden` and asserts no response;
4. loads the built OMP extension, submits `write_file` targeting `.harness/x`, and asserts `{ block: true }` with the no-retry suffix; and
5. asserts that the log contains two denial lines.

The policy and log are temporary smoke inputs. Native mission runs persist the same artifacts under their run directory; see [Tool Guard](../tool-guard.md).

## Running it

```sh
npm run build
node scripts/smoke/tool-guard/run.mjs
```

Expected output:

```text
PASS tool-guard Command Code + OMP denials and log lines
```

## What it proves

- Command Code's `PreToolUse` command hook can deny a shell Git mutation using the policy file.
- A read-only Git command is not denied by the Git-mutation rule.
- The OMP extension blocks a protected-root write before execution.
- Both enforcement seams write the same log shape, including timestamp, tool, class, target, and reason.

## What it does not prove

- It does not invoke an LLM or prove model compliance.
- It does not exercise a full `uh mission run` or the supervisor's native event stream.
- It does not prove operating-system isolation or rollback for an unmanaged process that bypasses the hook or extension.
