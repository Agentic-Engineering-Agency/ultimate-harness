# Verification Strategy

Ultimate Harness verification combines automated checks, structured review, sandbox boundary analysis, and human approval.

## Verification layers

1. **Schema validation** — mission packets, adapter manifests, workflow profiles, verification results.
2. **Static checks** — formatting, linting, type checks, docs link checks where applicable.
3. **Test execution** — project-specific unit/integration tests.
4. **Diff review** — inspect exactly what changed in sandbox.
5. **Spec compliance review** — compare outputs against issue/spec/mission criteria.
6. **Security/sandbox review** — detect unauthorized writes or risky behavior.
7. **Human approval** — required for canonical promotion by default.

## MVP approach

Before code exists, verification is documentation-focused:

- Docs tree exists.
- Required docs are linked from `docs/README.md`.
- Root `README.md` points to the docs spine.
- Key claims cite source systems.
- Mission schema includes a realistic example.
- Adapter contract includes lifecycle, capabilities, result shape, and responsibilities.
