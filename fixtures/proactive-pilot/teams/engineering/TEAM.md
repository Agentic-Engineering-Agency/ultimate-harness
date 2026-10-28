---
schema: ae.team.v1
team_id: engineering
department: engineering
role_kind: bounded_task_role
captain:
  id: engineering-task-role
  owner_ref: "<UNCONFIGURED:ENGINEERING_OWNER_REF>"
  session_owner: cloudflare_agents_do_piharness
  persistent: false
phase1:
  persistent_sales_captain: false
  autonomous_process: false
  first_10_working_days_external_writes: disabled
  private_preview:
    availability: after_first_10_working_days
    approval: human_required
  prohibited_external_writes:
    - email.send
    - crm.write
    - git.push
    - git.merge
    - deploy
    - release
    - billing.charge
    - sharing.change
  automatic_fallback: disabled
  deployment: disabled
  package_installs: disabled
authorities:
  logical_authority: telar
  tenant_serialization: d1_serialized_tenant_authority
  external_effect_owner: cloudflare_workflows
  coding_attempt_owner: uh
  native_session_owner: native_cli
profiles:
  policy: "<UNCONFIGURED:ENGINEERING_POLICY_PROFILE_REF>"
  budget: "<UNCONFIGURED:ENGINEERING_BUDGET_PROFILE_REF>"
  resource: "<UNCONFIGURED:ENGINEERING_RESOURCE_PROFILE_REF>"
  model: "<UNCONFIGURED:ENGINEERING_MODEL_PROFILE_REF>"
resources:
  - id: engineering-repository
    kind: repository
    ref: "<UNCONFIGURED:ENGINEERING_REPOSITORY_REF>"
    access: read
  - id: engineering-artifacts
    kind: artifact_store
    ref: "<UNCONFIGURED:INTERNAL_ARTIFACT_STORE_REF>"
    access: internal_write
  - id: model-endpoint
    kind: model_endpoint
    ref: "<UNCONFIGURED:MODEL_ENDPOINT_RESOURCE_REF>"
    access: read
  - id: approval-channel
    kind: approval_channel
    ref: "<UNCONFIGURED:ENGINEERING_APPROVAL_CHANNEL_REF>"
    access: read
proactive_lane:
  mode: permanent
  enabled: true
  external_access: read_only
  internal_writes: controlled
  external_writes: disabled
  source_resource_refs:
    - engineering-repository
task_roles:
  - id: bounded-implementation
    class: implementation_task
    objective: Implement an approved bounded specification in a fresh UH worktree from the exact task-supplied base or checkpoint commit.
    bounded: true
    allowed_capabilities:
      - external.read
      - internal.artifact.write
      - workspace.edit
      - test.execute
    max_concurrency: 1
    completion:
      receipts:
        - accepted_plan_sha256
        - spec_sha256
        - test_receipt
        - base_commit
        - candidate_commit
      human_gate: private_preview
  - id: independent-review
    class: review_task
    objective: Review the exact candidate commit in a separate read-only sandbox and return reproducible findings without modifying the candidate.
    bounded: true
    allowed_capabilities:
      - external.read
      - test.execute
      - review.read_only
      - internal.artifact.write
    max_concurrency: 1
    completion:
      receipts:
        - base_commit
        - candidate_commit
        - test_receipt
        - review_receipt
      human_gate: required
capability_matrix:
  - capability: external.read
    effect: read
    enabled: true
    approval: none
  - capability: internal.artifact.write
    effect: internal_write
    enabled: true
    approval: none
  - capability: workspace.edit
    effect: internal_write
    enabled: true
    approval: none
  - capability: test.execute
    effect: internal_write
    enabled: true
    approval: none
  - capability: review.read_only
    effect: read
    enabled: true
    approval: none
  - capability: private.preview
    effect: internal_write
    enabled: false
    approval: disabled
  - capability: email.send
    effect: external_write
    enabled: false
    approval: disabled
  - capability: crm.write
    effect: external_write
    enabled: false
    approval: disabled
  - capability: git.push
    effect: external_write
    enabled: false
    approval: disabled
  - capability: git.merge
    effect: external_write
    enabled: false
    approval: disabled
  - capability: deploy
    effect: external_write
    enabled: false
    approval: disabled
  - capability: package.install
    effect: control
    enabled: false
    approval: disabled
  - capability: host.secrets
    effect: control
    enabled: false
    approval: disabled
  - capability: host.sockets
    effect: control
    enabled: false
    approval: disabled
  - capability: credential.mount
    effect: control
    enabled: false
    approval: disabled
  - capability: egress.widen
    effect: control
    enabled: false
    approval: disabled
egress:
  default: deny
  allowlist:
    - purpose: model
      resource_ref: model-endpoint
      protocol: https
      port: 443
    - purpose: external_read
      resource_ref: engineering-repository
      protocol: https
      port: 443
    - purpose: internal_artifact
      resource_ref: engineering-artifacts
      protocol: https
      port: 443
  host_secrets: deny
  host_sockets: deny
  metadata_endpoints: deny
  private_control_networks: deny
  dns_exfiltration: deny
memory:
  read_scopes:
    - company
    - dept
    - task
    - approved_evidence
  write_tiers:
    - episodic
    - intent
    - review
  untrusted_inputs:
    - email
    - crm_notes
    - web
    - user_text
    - repository_content
  quarantine_extractor: true
  core_promotion: human_required
  cross_department: typed_handoff_only
approvals:
  external_writes: disabled
  private_preview: human_required
  timeout: deny
  approver_ref: "<UNCONFIGURED:ENGINEERING_APPROVER_REF>"
deadlines:
  heartbeat_interval_seconds: 15
  heartbeat_grace_seconds: 60
  max_task_seconds: 3600
  max_attempts: 1
---
# Engineering task role

Engineering is a bounded implementation-and-review role, not a persistent Captain. UH owns the coding attempt lifecycle: launch, lease epoch, cancellation, checkpoint, handoff, verification, and promotion decision. The Cloudflare Agents Durable Object plus PiHarness owns the surrounding session; the native CLI owns its own native session files. This playbook cannot resume a native session by editing its files.

## Implementation boundary

The task packet must contain an accepted-plan artifact SHA, spec/artifact SHA, exact configured repository resource, exact full base commit SHA, root budget reservation, task epoch, deadlines, capability matrix, and egress allowlist. A worker starts in a fresh task worktree. It may edit only that task workspace and write internal receipts/artifacts. Package installation, production/deployment access, `git push`, `git merge`, CRM writes, email sends, host secrets, host sockets, and egress widening are denied.

The candidate is exported with the exact base commit and exact candidate commit, deterministic test receipts, artifact hashes, and a limitation statement. An independent reviewer receives the exact candidate commit in a separate read-only sandbox with a separate scratch area for generated tests. The reviewer cannot rewrite the implementation or protected acceptance checks. Any implementation change invalidates the affected review receipts and requires a new review.

## Checkpoint handoff

There is no native automatic fallback. On quota, crash, deadline, or unsupported capability, the worker reports a typed failure. UH fences the epoch, terminates the old process, freezes and verifies a checkpoint, and reconciles external effects. Any effect with unknown outcome blocks the root attempt for human resolution. UH may then start a new attempt in a fresh worktree from the exact checkpoint commit; the new attempt receives a normalized brief rather than replayed tool calls.

A private preview is an internal, human-gated artifact. It is not a merge, deployment, release, customer promise, or authorization to write an external system.

## Exact workflow handoffs and scope gate

Receive `engineering.preview.requested` through Telar only after an `engineering.scope` human decision and the observation gate. `approval: none` for a sandbox edit/test means no additional per-tool human prompt inside that already approved scope; it does not permit starting unapproved work. Do not edit a repository during the observation-only subphase.

The proposed Workflow sends an idempotent mission to UH; this role does not launch a native CLI. The external AE v2 design package defines `worker/worker-adapter.ts` with exact accepted-plan, spec, acceptance, scope binding, root budget, mission/attempt/epoch and host profiles. Emit `engineering.preview.ready` only with accepted exact-candidate tests and independent review. Telar, not Engineering, emits `sales.preview.available` after validating result access/publication. This repository only rehearses the proposal with `src/harness/proactive-pilot/demo.ts` and the fake adapter in `src/harness/proactive-pilot/worker.ts`; see `docs/architecture/proactive-pilot-workers.md`, relative to the repository root, for limits.

A partial edit ledger is not proof against torn writes. UH must verify a known-good checkpoint and exclude secrets/untracked sensitive files; it cannot blindly checkpoint all files. Same root budget follows a new attempt; a changed candidate invalidates prior review or publication approval.
