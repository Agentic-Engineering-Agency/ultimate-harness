# Session Templates: Tiered Execution Configurations

## Overview & Purpose

Every mission packet in Ultimate Harness requires concrete runtime execution parameters: the target adapter and model, reasoning level, turn and time limits, stall and thinking budgets, recovery policy, and tool guard defaults. Previously, these choices were configured by hand inside individual mission files or injected via ad-hoc CLI arguments.

Session templates introduce reusable, tiered execution configurations stored under `.harness/templates/*.yaml`. They provide:
- **Reproducible tiers**: Standardized execution profiles categorized as `low-cost`, `balanced`, or `exhaustive`.
- **Reusable configurations**: Eliminate boilerplate repetition across missions while maintaining auditability.
- **Run index observability**: Record which template was adopted and which template keys were overridden by the mission, allowing outcome comparison across templates.
- **Promotion of proven configurations**: Identify high-performing configurations from historical runs and promote them across the project.

## Templates vs. Workflow Profiles

It is essential to distinguish between workflow profiles and session templates:

| Concept | Scope | Responsibility | Example |
| :--- | :--- | :--- | :--- |
| **Workflow Profile** | Mission Structure | Defines **what phases** a mission executes and in what sequence. | `spec-first-feature` (spec → implement → verify) |
| **Session Template** | Attempt Execution | Defines **how an attempt** within a phase is executed by the adapter. | `balanced` (Hermes, 15 turns, 300s timeout, single resume) |

A workflow profile is orthogonal to a session template: any mission regardless of its workflow profile can adopt any session template according to cost, time, and safety budgets.

## File Format (`uh.session-template.v0`)

Session templates are stored as YAML documents under `.harness/templates/<id>.yaml` adhering to the strict schema `uh.session-template.v0`.

```yaml
schema_version: uh.session-template.v0
id: balanced
title: Balanced Standard Execution
tier: balanced
containment: standard
adapter: hermes
runtime_config_overrides:
  model: "<provider/model>"
  thinking: low
limits:
  max_turns: 15
  timeout_ms: 300000
  stall_timeout_ms: 60000
recovery:
  max_resumes: 1
  notes: Single resumption on stall or timeout before terminal failure.
guard:
  write_roots:
    - src
    - tests
  deny_network_clients: true
attempts: 1
notes: Default balanced configuration providing standard turn limits and single-resume recovery.
```

### Schema Properties

- **`schema_version`** (`literal "uh.session-template.v0"`): Schema format version identifier.
- **`id`** (`safe identifier`): Safe alphanumeric slug (`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`, excluding `.` and `..`).
- **`title`** (`string`): Human-readable name of the configuration.
- **`tier`** (`"low-cost" | "balanced" | "exhaustive"`): Resource and effort tier.
- **`containment`** (`"standard" | "strict"`, default `"standard"`): Security and isolation tier.
- **`adapter`** (`enum`): One of the project's supported team adapter IDs (`hermes`, `codex`, `oh-my-pi`, `hermes-proxy`, `openrouter`, `anthropic`, `pi`, `command-code`, `claude-code`).
- **`runtime_config_overrides`** (`record`, default `{}`): Model parameters and adapter-specific flags (e.g. `model`, `thinking`, `temperature`).
- **`limits`** (`RuntimeLimitsSchema without memory_mb`, default `{}`): Enforced runtime constraints:
  - `max_turns`
  - `timeout_ms`
  - `stall_timeout_ms`
  - `max_thinking_ms`
  - `max_denials`
  - `max_repeated_failures`
  - `max_output_bytes`
  - `protected_paths`
  *(Note: `memory_mb` is omitted; memory governance is managed by team resource limits).*
- **`recovery`** (`RuntimeRecoveryPolicySchema`, optional): Recovery rules on failure or deadline:
  - `max_resumes`
  - `notes`
  - `on_deadline` (`grace_turns`, `grace_timeout_ms`)
- **`guard`** (`ToolGuardFieldsSchema`, optional): Tool safety guard properties (`write_roots`, `deny_git_mutations`, `deny_package_installs`, `deny_network_clients`, `allow_native_subagents`, `agent_clients`).
- **`attempts`** (`integer 1..8`, default `1`): Number of independent parallel attempts planned for exhaustive search.
- **`notes`** (`string`, optional): Operator and architectural notes.

## Precedence & Merge Semantics

When `applySessionTemplate(mission, template)` combines a mission document with a template, values are resolved with the rule: **Most specific wins**:

$$\text{Mission explicit values} \succ \text{Session template values} \succ \text{Harness defaults}$$

### Merging Rules

1. **Top-Level Primitives (`adapter`, `attempts`)**:
   - If the mission explicitly specifies the field, the mission value wins.
   - Otherwise, the template value is applied.
2. **Top-Level Record Merges (`runtime_config_overrides`, `limits`, `recovery`)**:
   - Merged shallowly key-by-key.
   - Keys defined explicitly in the mission override corresponding keys from the template.
   - Keys present only in the template are incorporated into the mission.
3. **Tool Guard (`guard`)**:
   - Merged field-by-field (`deny_git_mutations`, `deny_network_clients`, etc.), with one critical security invariant:
   - **`write_roots` is never widened**:
     If the mission defines `write_roots` (even if empty `[]`), the template's `write_roots` are completely ignored. The template cannot expand the write boundaries established by the mission author.
     If the mission does not specify `write_roots`, the template's `write_roots` are applied.
4. **Immutability**:
   - `applySessionTemplate` never mutates the input mission object; it returns a new document.

## Strict Containment

When a template specifies `containment: "strict"`, it enforces strict sandboxing rules designed for untrusted execution or high-risk tasks.

Applying a strict-containment template to a mission is refused with an error identifying the violated rule if the resulting configuration:
1. **Has no explicit `guard.write_roots`**:
   Refused if `write_roots` is undefined or an empty list.
2. **Specifies a write root of `"."`**:
   Refused if any write root is `.` (a sandbox must not target the entire repository root).
3. **Specifies an absolute write root**:
   Refused if any write root is an absolute filesystem path (e.g. `/tmp`, `C:\sandbox`).
4. **Allows native subagents**:
   Refused if `allow_native_subagents === true`. Runtimes in strict containment must not spawn unmonitored subagents.
5. **Permits network clients**:
   Refused if `deny_network_clients === false`. Network access from client tools must remain disabled.

## Run Index & Outcome Observability

When a template is applied, the harness helper `describeAppliedTemplate(mission, template)` produces an applied template descriptor:

```typescript
interface AppliedTemplateDescription {
  template_id: string;
  tier: "low-cost" | "balanced" | "exhaustive";
  containment: "standard" | "strict";
  overridden_by_mission: string[];
}
```

The `overridden_by_mission` list records which top-level template blocks (`adapter`, `runtime_config_overrides`, `limits`, `recovery`, `guard`, `attempts`) the mission explicitly overrode. This metadata is indexed in `runs/index.json` across executions, enabling operators to:
- Correlate pass/fail rates and token spend against tiers (`low-cost` vs `balanced` vs `exhaustive`).
- Identify common overrides that indicate when a base template's limits or settings need tuning.
- Systematically promote reliable configurations into standard templates.

## Adopting a template from the CLI

`uh mission run` and `uh mission dry-run` accept `--template <id>`. The template is loaded from `<root>/.harness/templates/<id>.yaml` and applied to the mission with `applySessionTemplate`, so mission values always win over template values.

The applied result is translated into the extra runtime-config overrides the run path already accepts: the applied `runtime_config_overrides` keys, plus `limits` and `recovery` when stated. An explicit `--runtime-config-overrides <json>` is spread on top, so the command line wins over both the mission and the template. Fleet admission runs after the template is applied, so a template cannot route a run around spend authorization.

When `--runtime` is omitted, the template's `adapter` is used. When `--runtime` is given and differs from the template's adapter, the run is refused with a message naming both. `--auto` cannot be combined with `--template`.

Refusals are reported as `[BLOCKED]` with exit code 2 before any runtime is spawned:
- An unknown or invalid template.
- A strict-containment violation (see above).
- A conflicting `--runtime`.

Dry-run prints a `Template:` line naming the template id, tier, containment, and the keys the mission overrode, plus the resolved effective overrides.

## Recording the adopted template

When a run adopts a template, the CLI writes `session-template.json` into the run directory (`.harness/missions/<mission>/runs/<run_id>/`), next to the adapter's `tool-guard.json`. The file contains exactly the `describeAppliedTemplate` record:

```json
{
  "template_id": "balanced",
  "tier": "balanced",
  "containment": "standard",
  "overridden_by_mission": ["limits"]
}
```

`indexRuns` reads this file into the run record's `template_id` and `tier` fields and leaves both undefined when a run did not adopt a template. `uh observatory runs --group-by` accepts `template` (grouping by `template_id`) and `tier` in addition to `runtime`, `model`, `workflow_profile`, and `stop_code`.


## Resilient Template Loading

The loader function `loadSessionTemplates(root)`:
- Scans `.harness/templates/*.yaml` and `*.yml`.
- Validates each file against `SessionTemplateSchema`.
- Skips invalid files, reporting the error and path via a warning without halting execution or affecting other valid templates.
- Returns valid templates sorted deterministically by `id`.
