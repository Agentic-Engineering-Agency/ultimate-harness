# Team integration report: implement-uh-slice-template

- Leader strategy: `merge`
- Leader branch: `uh/team/implement-uh-slice-template/leader`
- Workers: 2

## Workers

### `template-author` (codex)

- Branch: `uh/team/implement-uh-slice-template/template-author`
- Status: succeeded
- Files touched: 9
  - `.harness/audit/events.ndjson`
  - `.harness/missions/implement-uh-slice-template/runs/20260525T073520Z-59a335/diff.patch`
  - `.harness/missions/implement-uh-slice-template/runs/20260525T073520Z-59a335/events.ndjson`
  - `.harness/missions/implement-uh-slice-template/runs/20260525T073520Z-59a335/prompt.md`
  - `.harness/missions/implement-uh-slice-template/runs/20260525T073520Z-59a335/runtime-final.txt`
  - `.harness/missions/implement-uh-slice-template/runs/20260525T073520Z-59a335/runtime-result.yaml`
  - `.harness/missions/implement-uh-slice-template/runs/20260525T073520Z-59a335/runtime-session.yaml`
  - `examples/missions/templates/README.md`
  - `examples/missions/templates/implement-uh-slice.yaml`
- Leader merge: clean
- Leader note: Updating 7300f7e6..1dc9f67f
- Summary: Created the canonical dogfood mission template at examples/missions/templates/implement-uh-slice.yaml and the one-page operator guide at examples/missions/templates/README.md. The template uses shape: team, workflow_profile: staged, a complete acceptance_criteria block, concrete valid codex team adapter defaults, and verification.required_checks that enforce typecheck and tests. Verified with bun run typecheck, direct validateMission YAML parsing, and README existence; the broad test suite was attempted but is blocked by this worker sandbox’s process/network/git-signing restrictions rather than the new template.

### `readme-author` (oh-my-pi)

- Branch: `uh/team/implement-uh-slice-template/readme-author`
- Status: blocked
- Files touched: 0
- Leader merge: clean
- Leader note: skipped: worker status=blocked
- Summary: _(no runtime-final.txt captured)_
