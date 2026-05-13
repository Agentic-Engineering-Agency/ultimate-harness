# Workflow: Mission to Sandbox

## Use when

A mission is ready for runtime execution.

## Steps

1. Validate mission packet schema.
2. Resolve runtime adapter and capabilities.
3. Create sandbox from the correct base ref.
4. Hydrate sandbox with required files/context.
5. Generate runtime-specific prompt or command.
6. Launch runtime session.
7. Observe and record structured events.
8. Collect artifacts, diffs, logs, and blockers.

## Exit criteria

The harness has a runtime result and inspectable sandbox output.
