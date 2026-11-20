import { createHash } from "node:crypto";
import { isScalar, parseDocument, visit } from "yaml";
import {
  CAPABILITY_EFFECT,
  IMMUTABLE_REF,
  isUnconfiguredRef,
  PILOT_CAPABILITIES,
  PilotTeamSchema,
  type PilotCapability,
  type PilotTeam,
} from "../../schema/proactive-team.js";

// Loader + activation gate for AE Phase 1 TEAM.md playbooks. Parsing proves a
// file is review-valid; it never grants anything. Activation needs a
// server-supplied context and fails closed without one. See
// docs/architecture/proactive-pilot-workers.md.

export const MAX_TEAM_MARKDOWN_BYTES = 64 * 1024;

const FORBIDDEN = new Set<PilotCapability>(
  PILOT_CAPABILITIES.filter((c) => ["external_write", "control"].includes(CAPABILITY_EFFECT[c])),
);
const ALWAYS_PROHIBITED = ["email.send", "crm.write", "git.push", "git.merge", "deploy"] as const;
const PROACTIVE_READ_CAPS = new Set<string>(["external.read", "internal.note.write", "internal.artifact.write"]);
const INTERPOLATION = /\$\{|\$\(/;

export type ActivationBlockerReason =
  | "unconfigured" | "mutable_profile" | "unresolved" | "preview_window_closed" | "context_unavailable";
export interface ActivationBlocker { path: string; ref?: string; reason: ActivationBlockerReason }

export interface LoadedPilotTeam {
  team: PilotTeam;
  /** sha256 of the exact frontmatter text; recorded with any activation decision. */
  frontmatterSha256: string;
  /** Parse-valid but not activatable until these placeholders are configured. */
  activationBlockers: ActivationBlocker[];
}
export type PilotTeamLoadResult = ({ ok: true } & LoadedPilotTeam) | { ok: false; errors: string[] };

/** Parse and review-validate one TEAM.md. Body text after the frontmatter is ignored by design. */
export function loadPilotTeam(markdown: string): PilotTeamLoadResult {
  if (typeof markdown !== "string") return fail("input must be a string");
  if (Buffer.byteLength(markdown, "utf8") > MAX_TEAM_MARKDOWN_BYTES) {
    return fail(`input exceeds ${MAX_TEAM_MARKDOWN_BYTES} bytes`);
  }
  const lines = (markdown.startsWith("﻿") ? markdown.slice(1) : markdown).split("\n");
  if (lines[0]?.replace(/\r$/, "") !== "---") return fail("first line must be ---");
  const close = lines.findIndex((l, i) => i > 0 && /^[ \t]*---\r?$/.test(l));
  if (close < 0) return fail("missing closing --- delimiter");
  const frontmatter = lines.slice(1, close).join("\n");

  const doc = parseDocument(frontmatter, {
    version: "1.2", schema: "core", uniqueKeys: true, merge: false, strict: true, prettyErrors: false,
  });
  const errors = [...doc.errors, ...doc.warnings].map((e) => `yaml ${e.code}: ${e.message.split("\n")[0]}`);
  // Structural rejections run before toJS() so alias expansion never happens.
  visit(doc, {
    Alias() { errors.push("yaml aliases are not allowed"); return visit.BREAK; },
    Node(_, node) {
      if (node.anchor) errors.push("yaml anchors are not allowed");
      if (node.tag) errors.push(`yaml tags are not allowed (${node.tag})`);
      if (isScalar(node) && typeof node.value === "string" && INTERPOLATION.test(node.value)) {
        errors.push("interpolation syntax is not allowed");
      }
    },
    Pair(_, pair) {
      if (!isScalar(pair.key) || typeof pair.key.value !== "string") errors.push("mapping keys must be strings");
      else if (pair.key.value === "<<") errors.push("yaml merge keys (<<) are not allowed");
    },
  });
  if (errors.length) return { ok: false, errors: [...new Set(errors)] };

  const parsed = PilotTeamSchema.safeParse(doc.toJS());
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`) };
  }
  const team = parsed.data;
  const ruleErrors = teamRuleErrors(team);
  if (ruleErrors.length) return { ok: false, errors: ruleErrors };

  return {
    ok: true,
    team,
    frontmatterSha256: createHash("sha256").update(frontmatter, "utf8").digest("hex"),
    activationBlockers: externalRefs(team)
      .filter(([, ref]) => isUnconfiguredRef(ref))
      .map(([path, ref]) => ({ path, ref, reason: "unconfigured" as const })),
  };
}

function teamRuleErrors(t: PilotTeam): string[] {
  const errors: string[] = [];
  const sales = t.department === "sales";
  if (sales !== (t.role_kind === "persistent_captain")) errors.push("role_kind: only sales is persistent_captain");
  for (const [field, value] of [
    ["captain.persistent", t.captain.persistent],
    ["phase1.persistent_sales_captain", t.phase1.persistent_sales_captain],
    ["phase1.autonomous_process", t.phase1.autonomous_process],
  ] as const) {
    if (value !== sales) errors.push(`${field}: must be ${sales} for ${t.department}`);
  }
  for (const c of ALWAYS_PROHIBITED) {
    if (!t.phase1.prohibited_external_writes.includes(c)) errors.push(`phase1.prohibited_external_writes: missing ${c}`);
  }

  const enabled = new Set<string>();
  const seen = new Set<string>();
  for (const row of t.capability_matrix) {
    const where = `capability_matrix.${row.capability}`;
    if (seen.has(row.capability)) errors.push(`${where}: duplicate`);
    seen.add(row.capability);
    if (row.effect !== CAPABILITY_EFFECT[row.capability]) {
      errors.push(`${where}: effect must be ${CAPABILITY_EFFECT[row.capability]}`);
    }
    if (FORBIDDEN.has(row.capability) && (row.enabled || row.approval !== "disabled")) {
      errors.push(`${where}: forbidden in Phase 1 (enabled: false, approval: disabled)`);
    }
    if (row.enabled && row.approval === "disabled") errors.push(`${where}: enabled with approval disabled`);
    if (row.capability === "private.preview" && row.enabled && row.approval !== "human_required") {
      errors.push(`${where}: private.preview requires human_required approval`);
    }
    if (row.enabled) enabled.add(row.capability);
  }

  const used = new Set<string>();
  for (const role of t.task_roles) {
    const where = `task_roles.${role.id}`;
    for (const cap of role.allowed_capabilities) {
      used.add(cap);
      if (!(PILOT_CAPABILITIES as readonly string[]).includes(cap)) errors.push(`${where}: unknown capability ${cap}`);
      else if (!enabled.has(cap)) errors.push(`${where}: capability ${cap} is not enabled`);
    }
    if (role.class === "review_task" && (!role.allowed_capabilities.includes("review.read_only")
      || role.allowed_capabilities.includes("workspace.edit"))) {
      errors.push(`${where}: review roles must hold review.read_only and not workspace.edit`);
    }
    if (role.class === "proactive_read" && role.allowed_capabilities.some((c) => !PROACTIVE_READ_CAPS.has(c))) {
      errors.push(`${where}: proactive lane is external read-only`);
    }
  }
  for (const cap of enabled) if (!used.has(cap)) errors.push(`capability_matrix.${cap}: enabled but unused by any role`);

  const resources = new Map(t.resources.map((r) => [r.id, r]));
  if (resources.size !== t.resources.length) errors.push("resources: duplicate id");
  for (const id of t.proactive_lane.source_resource_refs) {
    if (resources.get(id)?.access !== "read") errors.push(`proactive_lane.source_resource_refs: ${id} must be a read resource`);
  }
  for (const e of t.egress.allowlist) {
    const r = resources.get(e.resource_ref);
    if (!r) errors.push(`egress.allowlist: unknown resource ${e.resource_ref}`);
    else if ((e.purpose === "model") !== (r.kind === "model_endpoint")) {
      errors.push(`egress.allowlist: ${e.resource_ref} purpose ${e.purpose} does not match kind ${r.kind}`);
    }
  }
  return errors;
}

function externalRefs(t: PilotTeam): Array<[path: string, ref: string]> {
  return [
    ...Object.entries(t.profiles).map(([k, v]) => [`profiles.${k}`, v] as [string, string]),
    ["captain.owner_ref", t.captain.owner_ref],
    ["approvals.approver_ref", t.approvals.approver_ref],
    ...t.resources.map((r) => [`resources.${r.id}.ref`, r.ref] as [string, string]),
  ];
}

/** Pilot set rule: exactly one Sales persistent captain plus one bounded Product and Engineering role. */
export function validatePilotTeamSet(teams: readonly PilotTeam[]): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const dept of ["sales", "product", "engineering"] as const) {
    const n = teams.filter((t) => t.department === dept).length;
    if (n !== 1) errors.push(`expected exactly one ${dept} playbook, got ${n}`);
  }
  const persistent = teams.filter((t) => t.role_kind === "persistent_captain" || t.captain.persistent);
  if (persistent.length !== 1 || persistent[0]?.department !== "sales") {
    errors.push("exactly one persistent playbook is allowed and it must be sales");
  }
  if (new Set(teams.map((t) => t.team_id)).size !== teams.length) errors.push("duplicate team_id");
  return { ok: errors.length === 0, errors };
}

/**
 * Server-supplied facts. `resolvedRefs` is what the Telar resource/profile policy
 * returned for this tenant; a ref string in TEAM.md is never itself a grant.
 */
export interface PilotActivationContext {
  resolvedRefs: ReadonlySet<string>;
  privatePreviewWindowOpen: boolean;
}
export interface PilotActivationReport {
  activatable: boolean;
  setErrors: string[];
  teams: Array<{ team_id: string; frontmatterSha256: string; activatable: boolean; blockers: ActivationBlocker[] }>;
}

export function derivePilotActivationReport(
  loaded: readonly LoadedPilotTeam[],
  context: PilotActivationContext | undefined,
): PilotActivationReport {
  const set = validatePilotTeamSet(loaded.map((l) => l.team));
  const teams = loaded.map(({ team, frontmatterSha256 }) => {
    const blockers: ActivationBlocker[] = [];
    if (!context) blockers.push({ path: "<context>", reason: "context_unavailable" });
    for (const [path, ref] of externalRefs(team)) {
      if (isUnconfiguredRef(ref)) blockers.push({ path, ref, reason: "unconfigured" });
      else if (path.startsWith("profiles.") && !IMMUTABLE_REF.test(ref)) blockers.push({ path, ref, reason: "mutable_profile" });
      else if (context && !context.resolvedRefs.has(ref)) blockers.push({ path, ref, reason: "unresolved" });
    }
    const preview = team.capability_matrix.find((c) => c.capability === "private.preview" && c.enabled);
    if (preview && context && !context.privatePreviewWindowOpen) {
      blockers.push({ path: "capability_matrix.private.preview", reason: "preview_window_closed" });
    }
    return { team_id: team.team_id, frontmatterSha256, activatable: blockers.length === 0, blockers };
  });
  return { activatable: set.ok && teams.every((t) => t.activatable), setErrors: set.errors, teams };
}

const fail = (error: string): PilotTeamLoadResult => ({ ok: false, errors: [error] });
