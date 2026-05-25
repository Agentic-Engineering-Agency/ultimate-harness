# Implement UH Slice Mission Template

Copy `implement-uh-slice.yaml` when implementing one Linear UH-NNN slice as a team mission.

## How To Use

1. Copy `examples/missions/templates/implement-uh-slice.yaml` to a mission-specific file or mission packet location.
2. Substitute every `<ALL_CAPS>` placeholder:
   - `<UH-NNN>`: the Linear issue id, for example `UH-126`.
   - `<SLICE_NAME>`: a short human-readable slice name.
   - `<PRIMARY_CODE_OR_DOC_PATH>` and `<SECONDARY_CODE_OR_DOC_PATH>`: the most important files the mission agents should read first.
   - `<EXPECTED_ARTIFACT_PATH>`: the primary file the slice must create or modify.
   - `<EXPECTED_TEST_PATH>`: the targeted regression test file for the slice.
3. Adjust `team.workers` only if the slice needs different valid adapter ids or more parallel lanes.
4. Keep `shape: team`, `workflow_profile: staged`, `acceptance_criteria[]`, and the typecheck/test entries in `verification.required_checks[]`.
5. Run the mission:

```sh
uh mission run-team <id>
```

## Operator Notes

The template is intentionally valid under today's schema before placeholder substitution. Adapter ids use concrete defaults because the schema validates them against the registered team adapters. Placeholder values are reserved for mission-specific text, paths, commands, and Linear references.

Use this for implementation missions only. Do not use it to promote PRs, flip Linear state, or implement multiple UH slices in one packet.
