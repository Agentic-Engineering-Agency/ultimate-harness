# Local pilot choices

## Settled for this slice

- **Rehearse proposed contracts in UH, leave Telar untouched.** The on-disk Telar constitution gates product implementation and encodes older architecture decisions. Treating a research proposal as an adopted migration would be unsafe. This prototype exercises local data contracts without becoming a second business authority.
- **Reuse existing package dependencies.** Zod, YAML, Vitest, TypeScript and Node-compatible helpers already exist in UH. Restore the frozen lockfile without lifecycle scripts; no new dependency or framework is required.
- **Keep CLI dispatch unchanged.** The first playable surface is a dedicated local demo script and exported fixture flow, not an extra live run controller hidden in `src/cli.ts`.
- **Separate two implementation lanes and one integration owner.** New schemas/admission and TEAM/fake-worker mechanics have disjoint files. No existing main-checkout dirt is imported or overwritten.
- **Fixture trust is not authenticated human authority.** Injected context and fake approval decisions test refusal behavior but cannot authorize live access. Artifacts remain unpublished.
- **Keep deterministic policy checks deterministic.** No TypeSafe judgment, model API request or probability threshold is needed for schema validity, exact hashes, principal equality, costs, epochs or route allowlists. Do not add inference just to demonstrate a skill.

## Provisional and explicitly not production-ready

- **Canonical JSON is a qualified subset until proved otherwise.** The implementation must document and test the accepted value domain. Do not label an ad-hoc serializer universally RFC 8785 compliant.
- **Fake worker state is ephemeral.** Tests may simulate replay/cancel/quiescence, but no process isolation, remote cancellation or persistence guarantee follows from an in-memory class.
- **Real platform integration remains a separate decision.** Live identity, policy storage, broker effects, Cloudflare/Pi qualification, actual native worker lease enforcement and a real independent-review execution host are not silently selected by this rehearsal.
