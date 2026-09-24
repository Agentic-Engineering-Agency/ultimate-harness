# Checks

## Declared output checks

`uh verify <mission-id>` checks every `expected_artifacts` entry after command
checks. Legacy `expected_outputs.files` declarations use the same verification.
Paths resolve inside the effective workspace (the bound sandbox when selected).
Missing, empty, non-regular, unreadable, and workspace-escaping outputs fail.
Directory links cannot redirect these reads outside the workspace.

```yaml
expected_artifacts:
  - path: out/data.json
  - path: out/report.md
    completion_marker: DONE
```

Files ending in `.json`, or explicitly declared with `type: json`, must parse.
An optional `completion_marker` must match the last nonblank line exactly after
trimming surrounding whitespace. Thus a required `DONE` marker does not accept
`BLOCKED: ...`. Parse failures do not copy malformed file contents into findings.

These checks appear in the existing `verification.yaml` result and can verify
file-only missions without a shell command. Presence, syntax, and a marker do
not prove that claims are correct: retain semantic acceptance criteria and
independent review. These checks are not a filesystem sandbox or a secret scanner.

## Documentation checks

```bash
find docs -type f | sort
```

Expected: required docs from the handoff are present.

```bash
git diff -- README.md docs
```

Expected: changes are intentional and navigable.

Optional later:

```bash
markdown-link-check docs/**/*.md README.md
```

## Future schema checks

```bash
uh validate .harness/project.yaml
uh validate .harness/missions/<id>/mission.yaml
uh validate .harness/adapters/<adapter>.yaml
```

## Future runtime checks

```bash
uh adapter check hermes
uh mission dry-run .harness/missions/<id>/mission.yaml
uh sandbox inspect <sandbox-id>
```
