import { z } from "zod";

// AE Phase 1 TEAM.md frontmatter (`ae.team.v1`). Mirrors the design package's
// team.schema.json with every object strict. Cross-field rules live in
// src/harness/proactive-pilot/team.ts; this file only defines the shape.

export const PILOT_TEAM_SCHEMA = "ae.team.v1" as const;

const PLACEHOLDER = /^<UNCONFIGURED:[A-Z][A-Z0-9_]*>$/;
const URI = /^[a-z][a-z0-9+.-]*:\/\/\S+$/;
/** Configured profile refs must be content-addressed, never a mutable name/tag. */
export const IMMUTABLE_REF = /@sha256:[0-9a-f]{64}$/;

export const isUnconfiguredRef = (ref: string): boolean => PLACEHOLDER.test(ref);

const ExternalRef = z.string().refine((v) => PLACEHOLDER.test(v) || URI.test(v), {
  message: "must be <UNCONFIGURED:NAME> or an absolute URI",
});
const Slug = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/);
const ResourceId = z.string().regex(/^[a-z][a-z0-9.-]{1,63}$/);
const uniqueArray = <T extends z.ZodType>(item: T, min = 1) =>
  z.array(item).min(min).refine((a) => new Set(a.map((v) => JSON.stringify(v))).size === a.length, {
    message: "items must be unique",
  });

export const PILOT_CAPABILITIES = [
  "external.read", "internal.note.write", "internal.artifact.write", "private.preview",
  "workspace.edit", "test.execute", "review.read_only",
  "email.send", "crm.write", "git.push", "git.merge", "deploy",
  "package.install", "host.secrets", "host.sockets", "credential.mount", "egress.widen",
] as const;
export type PilotCapability = (typeof PILOT_CAPABILITIES)[number];
export const PilotCapabilitySchema = z.enum(PILOT_CAPABILITIES);

const Effect = z.enum(["read", "internal_write", "external_write", "control"]);

/** Canonical effect class per capability; a TEAM file cannot relabel one. */
export const CAPABILITY_EFFECT: Record<PilotCapability, z.infer<typeof Effect>> = {
  "external.read": "read",
  "internal.note.write": "internal_write",
  "internal.artifact.write": "internal_write",
  "private.preview": "internal_write",
  "workspace.edit": "internal_write",
  "test.execute": "internal_write",
  "review.read_only": "read",
  "email.send": "external_write",
  "crm.write": "external_write",
  "git.push": "external_write",
  "git.merge": "external_write",
  deploy: "external_write",
  "package.install": "control",
  "host.secrets": "control",
  "host.sockets": "control",
  "credential.mount": "control",
  "egress.widen": "control",
};

const ProhibitedWrite = z.enum([
  "email.send", "crm.write", "git.push", "git.merge", "deploy", "release", "billing.charge", "sharing.change",
]);

export const PilotTeamSchema = z.object({
  schema: z.literal(PILOT_TEAM_SCHEMA),
  team_id: Slug,
  department: z.enum(["sales", "product", "engineering"]),
  role_kind: z.enum(["persistent_captain", "bounded_task_role"]),
  captain: z.object({
    id: Slug,
    owner_ref: ExternalRef,
    // ponytail: team.schema.json says `cloudflare_agents_do_pi_harness`, all three
    // reviewed TEAM.md files say `..._piharness`. Accept the files' spelling only;
    // reconcile upstream before activation leaves fixture mode.
    session_owner: z.literal("cloudflare_agents_do_piharness"),
    persistent: z.boolean(),
  }).strict(),
  phase1: z.object({
    persistent_sales_captain: z.boolean(),
    autonomous_process: z.boolean(),
    first_10_working_days_external_writes: z.literal("disabled"),
    private_preview: z.object({
      availability: z.literal("after_first_10_working_days"),
      approval: z.literal("human_required"),
    }).strict(),
    prohibited_external_writes: uniqueArray(ProhibitedWrite, 6),
    automatic_fallback: z.literal("disabled"),
    deployment: z.literal("disabled"),
    package_installs: z.literal("disabled"),
  }).strict(),
  authorities: z.object({
    logical_authority: z.literal("telar"),
    tenant_serialization: z.literal("d1_serialized_tenant_authority"),
    external_effect_owner: z.literal("cloudflare_workflows"),
    coding_attempt_owner: z.literal("uh"),
    native_session_owner: z.literal("native_cli"),
  }).strict(),
  profiles: z.object({
    policy: ExternalRef,
    budget: ExternalRef,
    resource: ExternalRef,
    model: ExternalRef,
  }).strict(),
  resources: uniqueArray(z.object({
    id: ResourceId,
    kind: z.enum([
      "external_system", "repository", "artifact_store", "inbox", "crm", "model_endpoint", "approval_channel",
    ]),
    ref: ExternalRef,
    access: z.enum(["read", "internal_write"]),
  }).strict()),
  proactive_lane: z.object({
    mode: z.literal("permanent"),
    enabled: z.literal(true),
    external_access: z.literal("read_only"),
    internal_writes: z.literal("controlled"),
    external_writes: z.literal("disabled"),
    source_resource_refs: uniqueArray(ResourceId),
  }).strict(),
  task_roles: uniqueArray(z.object({
    id: Slug,
    class: z.enum(["proactive_read", "draft_task", "spec_task", "implementation_task", "review_task"]),
    objective: z.string().min(1).max(1000),
    bounded: z.literal(true),
    // Plain strings so an unknown capability is reported by the cross-field check, by name.
    // `_` admitted: team.schema.json's pattern rejects its own `review.read_only`.
    allowed_capabilities: uniqueArray(z.string().regex(/^[a-z][a-z0-9._-]{1,63}$/)),
    max_concurrency: z.number().int().min(1).max(3),
    completion: z.object({
      receipts: uniqueArray(z.enum([
        "source_snapshot", "internal_note_sha256", "artifact_sha256", "accepted_plan_sha256", "spec_sha256",
        "test_receipt", "review_receipt", "base_commit", "candidate_commit", "private_preview_ref",
      ])),
      human_gate: z.enum(["none", "private_preview", "required"]),
    }).strict(),
  }).strict()),
  capability_matrix: uniqueArray(z.object({
    capability: PilotCapabilitySchema,
    effect: Effect,
    enabled: z.boolean(),
    approval: z.enum(["none", "human_required", "disabled"]),
  }).strict()),
  egress: z.object({
    default: z.literal("deny"),
    allowlist: uniqueArray(z.object({
      purpose: z.enum(["model", "external_read", "internal_artifact"]),
      resource_ref: ResourceId,
      protocol: z.literal("https"),
      port: z.literal(443),
    }).strict()),
    host_secrets: z.literal("deny"),
    host_sockets: z.literal("deny"),
    metadata_endpoints: z.literal("deny"),
    private_control_networks: z.literal("deny"),
    dns_exfiltration: z.literal("deny"),
  }).strict(),
  memory: z.object({
    read_scopes: uniqueArray(z.enum(["company", "dept", "task", "approved_evidence"])),
    write_tiers: uniqueArray(z.enum(["episodic", "intent", "review"])),
    untrusted_inputs: uniqueArray(z.enum(["email", "crm_notes", "web", "user_text", "repository_content"])),
    quarantine_extractor: z.literal(true),
    core_promotion: z.literal("human_required"),
    cross_department: z.literal("typed_handoff_only"),
  }).strict(),
  approvals: z.object({
    external_writes: z.literal("disabled"),
    private_preview: z.literal("human_required"),
    timeout: z.literal("deny"),
    approver_ref: ExternalRef,
  }).strict(),
  deadlines: z.object({
    heartbeat_interval_seconds: z.number().int().min(1).max(300),
    heartbeat_grace_seconds: z.number().int().min(1).max(900),
    max_task_seconds: z.number().int().min(1).max(86400),
    max_attempts: z.literal(1),
  }).strict(),
}).strict();

export type PilotTeam = z.infer<typeof PilotTeamSchema>;
