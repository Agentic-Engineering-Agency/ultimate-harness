---
schema: ae.team.v1
team_id: product
department: product
role_kind: bounded_task_role
captain:
  id: product-task-role
  owner_ref: "<UNCONFIGURED:PRODUCT_OWNER_REF>"
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
  policy: "<UNCONFIGURED:PRODUCT_POLICY_PROFILE_REF>"
  budget: "<UNCONFIGURED:PRODUCT_BUDGET_PROFILE_REF>"
  resource: "<UNCONFIGURED:PRODUCT_RESOURCE_PROFILE_REF>"
  model: "<UNCONFIGURED:PRODUCT_MODEL_PROFILE_REF>"
resources:
  - id: product-evidence-read
    kind: external_system
    ref: "<UNCONFIGURED:PRODUCT_EVIDENCE_RESOURCE_REF>"
    access: read
  - id: product-artifacts
    kind: artifact_store
    ref: "<UNCONFIGURED:INTERNAL_ARTIFACT_STORE_REF>"
    access: internal_write
  - id: model-endpoint
    kind: model_endpoint
    ref: "<UNCONFIGURED:MODEL_ENDPOINT_RESOURCE_REF>"
    access: read
  - id: approval-channel
    kind: approval_channel
    ref: "<UNCONFIGURED:PRODUCT_APPROVAL_CHANNEL_REF>"
    access: read
proactive_lane:
  mode: permanent
  enabled: true
  external_access: read_only
  internal_writes: controlled
  external_writes: disabled
  source_resource_refs:
    - product-evidence-read
task_roles:
  - id: gap-to-spec
    class: spec_task
    objective: Convert an accepted typed product-gap handoff into a bounded, evidence-linked specification and acceptance criteria.
    bounded: true
    allowed_capabilities:
      - external.read
      - internal.note.write
      - internal.artifact.write
    max_concurrency: 1
    completion:
      receipts:
        - source_snapshot
        - accepted_plan_sha256
        - spec_sha256
      human_gate: required
  - id: private-preview-brief
    class: draft_task
    objective: Prepare a customer-safe private-preview brief from an approved specification without making a customer commitment.
    bounded: true
    allowed_capabilities:
      - external.read
      - internal.artifact.write
      - private.preview
    max_concurrency: 1
    completion:
      receipts:
        - spec_sha256
        - artifact_sha256
        - private_preview_ref
      human_gate: private_preview
capability_matrix:
  - capability: external.read
    effect: read
    enabled: true
    approval: none
  - capability: internal.note.write
    effect: internal_write
    enabled: true
    approval: none
  - capability: internal.artifact.write
    effect: internal_write
    enabled: true
    approval: none
  - capability: private.preview
    effect: internal_write
    enabled: true
    approval: human_required
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
      resource_ref: product-evidence-read
      protocol: https
      port: 443
    - purpose: internal_artifact
      resource_ref: product-artifacts
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
  quarantine_extractor: true
  core_promotion: human_required
  cross_department: typed_handoff_only
approvals:
  external_writes: disabled
  private_preview: human_required
  timeout: deny
  approver_ref: "<UNCONFIGURED:PRODUCT_APPROVER_REF>"
deadlines:
  heartbeat_interval_seconds: 30
  heartbeat_grace_seconds: 120
  max_task_seconds: 1800
  max_attempts: 1
---
# Product task role

Product is a bounded task role invoked by a typed Sales handoff or an explicitly authorized internal request. It is not a third autonomous process and owns no standing schedule, signal loop, or retry policy.

## Required output

The role returns a versioned internal specification with an accepted-plan reference, evidence references, scope and non-goals, acceptance criteria, assumptions, risk notes, and a SHA-256. Any customer-sensitive material is minimized and redacted according to the Telar decision. A private-preview brief is an internal artifact and is not a customer promise.

Product may read configured evidence and write controlled internal notes/spec artifacts. It cannot update CRM records, send messages, push or merge code, deploy, install packages, access host secrets or sockets, or widen egress. A human must approve a private preview and any cross-department disclosure.

Product hands Engineering a typed request containing the exact spec artifact SHA, accepted plan SHA, approval reference, requested capability, repository resource reference if code is needed, and an exact base commit supplied by the task authority. It never invents a repository path, commit, model ID, owner, or budget.

## Exact workflow handoffs

Receive `product.gap.requested` from Sales through Telar. Produce separate versioned spec and acceptance-criteria artifacts. Request an `engineering.scope` approval binding their exact hashes/revisions, repository/base commit, tests, sandbox and budget. Only after authenticated human approval and observation/qualification gates may Telar admit `engineering.preview.requested`. Cross-department disclosure is allowed only by the current explicit grant; a new sensitive disclosure requires its own review.

`private.preview` is internal brief/artifact generation, never opening network access or changing SaaS sharing. Private live-preview publishing is a separate `private_preview.publish` broker effect. Product cannot execute it or alter its audience. These are proposed rules from the external AE v2 design package. The local rehearsal and its limits are in `src/harness/proactive-pilot/demo.ts` and `docs/architecture/proactive-pilot-contracts.md`, relative to the repository root; no production broker or route state machine is implemented here.
