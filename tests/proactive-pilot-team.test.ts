import { describe, expect, test } from "vitest";
import { stringify } from "yaml";
import {
  derivePilotActivationReport,
  loadPilotTeam,
  MAX_TEAM_MARKDOWN_BYTES,
  validatePilotTeamSet,
  type LoadedPilotTeam,
} from "../src/harness/proactive-pilot/team.js";

type Dept = "sales" | "product" | "engineering";
const U = (name: string) => `<UNCONFIGURED:${name}>`;
const off = (capability: string, effect: string) => ({ capability, effect, enabled: false, approval: "disabled" });
const on = (capability: string, effect: string, approval = "none") => ({ capability, effect, enabled: true, approval });
const forbiddenRows = () => [
  ...["email.send", "crm.write", "git.push", "git.merge", "deploy"].map((c) => off(c, "external_write")),
  ...["package.install", "host.secrets", "host.sockets", "credential.mount", "egress.widen"].map((c) => off(c, "control")),
];

// Shape mirrors the reviewed design-package TEAM.md files, all refs left UNCONFIGURED.
function teamObject(dept: Dept): Record<string, any> {
  const sales = dept === "sales";
  const D = dept.toUpperCase();
  return {
    schema: "ae.team.v1",
    team_id: dept,
    department: dept,
    role_kind: sales ? "persistent_captain" : "bounded_task_role",
    captain: { id: `${dept}-captain`, owner_ref: U(`${D}_OWNER_REF`), session_owner: "cloudflare_agents_do_piharness", persistent: sales },
    phase1: {
      persistent_sales_captain: sales,
      autonomous_process: sales,
      first_10_working_days_external_writes: "disabled",
      private_preview: { availability: "after_first_10_working_days", approval: "human_required" },
      prohibited_external_writes: ["email.send", "crm.write", "git.push", "git.merge", "deploy", "release", "billing.charge", "sharing.change"],
      automatic_fallback: "disabled",
      deployment: "disabled",
      package_installs: "disabled",
    },
    authorities: {
      logical_authority: "telar",
      tenant_serialization: "d1_serialized_tenant_authority",
      external_effect_owner: "cloudflare_workflows",
      coding_attempt_owner: "uh",
      native_session_owner: "native_cli",
    },
    profiles: { policy: U(`${D}_POLICY`), budget: U(`${D}_BUDGET`), resource: U(`${D}_RESOURCE`), model: U(`${D}_MODEL`) },
    resources: [
      { id: "source-read", kind: dept === "engineering" ? "repository" : "external_system", ref: U(`${D}_SOURCE_REF`), access: "read" },
      { id: "artifacts", kind: "artifact_store", ref: U("INTERNAL_ARTIFACT_STORE_REF"), access: "internal_write" },
      { id: "model-endpoint", kind: "model_endpoint", ref: U("MODEL_ENDPOINT_REF"), access: "read" },
    ],
    proactive_lane: {
      mode: "permanent", enabled: true, external_access: "read_only", internal_writes: "controlled",
      external_writes: "disabled", source_resource_refs: ["source-read"],
    },
    task_roles: dept === "engineering"
      ? [
          role("impl", "implementation_task", ["external.read", "internal.artifact.write", "workspace.edit", "test.execute"]),
          role("review", "review_task", ["external.read", "test.execute", "review.read_only", "internal.artifact.write"]),
        ]
      : [role("lane", "proactive_read", ["external.read", "internal.note.write", "internal.artifact.write"])],
    capability_matrix: [
      on("external.read", "read"),
      on("internal.artifact.write", "internal_write"),
      ...(dept === "engineering"
        ? [on("workspace.edit", "internal_write"), on("test.execute", "internal_write"), on("review.read_only", "read")]
        : [on("internal.note.write", "internal_write")]),
      off("private.preview", "internal_write"),
      ...forbiddenRows(),
    ],
    egress: {
      default: "deny",
      allowlist: [
        { purpose: "model", resource_ref: "model-endpoint", protocol: "https", port: 443 },
        { purpose: "external_read", resource_ref: "source-read", protocol: "https", port: 443 },
      ],
      host_secrets: "deny", host_sockets: "deny", metadata_endpoints: "deny",
      private_control_networks: "deny", dns_exfiltration: "deny",
    },
    memory: {
      read_scopes: ["company", "task"], write_tiers: ["episodic"], untrusted_inputs: ["email", "web"],
      quarantine_extractor: true, core_promotion: "human_required", cross_department: "typed_handoff_only",
    },
    approvals: { external_writes: "disabled", private_preview: "human_required", timeout: "deny", approver_ref: U(`${D}_APPROVER_REF`) },
    deadlines: { heartbeat_interval_seconds: 30, heartbeat_grace_seconds: 120, max_task_seconds: 1800, max_attempts: 1 },
  };
}
function role(id: string, cls: string, caps: string[]) {
  return { id, class: cls, objective: "Fixture objective.", bounded: true, allowed_capabilities: caps, max_concurrency: 1,
    completion: { receipts: ["artifact_sha256"], human_gate: "required" } };
}
const md = (fm: string) => `---\n${fm}---\n# Body\n\nprofiles:\n  policy: ignored-body-text\n`;
const teamMd = (dept: Dept, mutate?: (t: Record<string, any>) => void) => {
  const t = teamObject(dept);
  mutate?.(t);
  return md(stringify(t));
};
const loadOk = (text: string): LoadedPilotTeam => {
  const r = loadPilotTeam(text);
  if (!r.ok) throw new Error(r.errors.join("\n"));
  return r;
};
const errorsOf = (text: string) => {
  const r = loadPilotTeam(text);
  expect(r.ok).toBe(false);
  return r.ok ? "" : r.errors.join("\n");
};

describe("loadPilotTeam", () => {
  test("placeholder refs are parse-valid but every one is an activation blocker", () => {
    const r = loadOk(teamMd("sales"));
    expect(r.team.department).toBe("sales");
    expect(r.frontmatterSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.activationBlockers.map((b) => b.path)).toEqual([
      "profiles.policy", "profiles.budget", "profiles.resource", "profiles.model",
      "captain.owner_ref", "approvals.approver_ref",
      "resources.source-read.ref", "resources.artifacts.ref", "resources.model-endpoint.ref",
    ]);
    expect(r.activationBlockers.every((b) => b.reason === "unconfigured")).toBe(true);
  });

  test("accepts a UTF-8 BOM and ignores the body", () => {
    expect(loadPilotTeam(`﻿${teamMd("product")}`).ok).toBe(true);
  });

  test.each([
    ["duplicate keys", "schema: ae.team.v1\nschema: ae.team.v1\n", "DUPLICATE_KEY"],
    ["anchors/aliases", "a: &x 1\nb: *x\n", "aliases"],
    ["custom tags", "a: !shell rm\n", "tags are not allowed"],
    ["core tags", "a: !!str 1\n", "tags are not allowed"],
    ["non-string keys", "1: x\n", "keys must be strings"],
    ["interpolation", "a: ${HOME}\n", "interpolation"],
    ["merge keys", "a: {x: 1}\nb:\n  <<: {x: 1}\n", "<<"],
    ["multiple documents", "a: 1\n---\nb: 2\n", ""],
  ])("rejects YAML attack: %s", (_name, fm, needle) => {
    // The 2nd delimiter case closes frontmatter early; still never parse-valid.
    expect(errorsOf(md(fm))).toContain(needle);
  });

  test("rejects oversized input and missing delimiters", () => {
    expect(errorsOf("---\n" + "a: b\n".repeat(MAX_TEAM_MARKDOWN_BYTES / 5) + "---\n")).toContain("exceeds");
    expect(errorsOf("schema: ae.team.v1\n")).toContain("first line");
    expect(errorsOf("---\nschema: ae.team.v1\n")).toContain("closing");
  });

  test("rejects unknown fields and any authority/constant change", () => {
    expect(errorsOf(teamMd("sales", (t) => { t.grants = ["all"]; }))).toContain("grants");
    expect(errorsOf(teamMd("sales", (t) => { t.authorities.coding_attempt_owner = "sales"; }))).toContain("coding_attempt_owner");
    expect(errorsOf(teamMd("sales", (t) => { t.egress.default = "allow"; }))).toContain("egress.default");
    expect(errorsOf(teamMd("sales", (t) => { t.proactive_lane.external_writes = "enabled"; }))).toContain("proactive_lane");
  });

  test("no authority expansion: forbidden capabilities stay disabled and relabelling fails", () => {
    expect(errorsOf(teamMd("sales", (t) => {
      t.capability_matrix.find((c: any) => c.capability === "email.send").enabled = true;
    }))).toContain("email.send: forbidden");
    expect(errorsOf(teamMd("sales", (t) => {
      t.capability_matrix.find((c: any) => c.capability === "git.push").effect = "read";
    }))).toContain("git.push: effect must be external_write");
    expect(errorsOf(teamMd("sales", (t) => { t.task_roles[0].allowed_capabilities.push("crm.write"); })))
      .toContain("crm.write is not enabled");
  });

  test("bounded roles only: product cannot be persistent", () => {
    const e = errorsOf(teamMd("product", (t) => { t.role_kind = "persistent_captain"; t.captain.persistent = true; }));
    expect(e).toContain("only sales is persistent_captain");
    expect(e).toContain("captain.persistent");
  });

  test("unsupported or disabled capabilities are rejected by name", () => {
    expect(errorsOf(teamMd("sales", (t) => { t.task_roles[0].allowed_capabilities.push("shell.exec"); })))
      .toContain("unknown capability shell.exec");
    expect(errorsOf(teamMd("sales", (t) => { t.task_roles[0].allowed_capabilities.push("private.preview"); })))
      .toContain("private.preview is not enabled");
    expect(errorsOf(teamMd("sales", (t) => { t.capability_matrix.push({ capability: "shell.exec", effect: "read", enabled: false, approval: "disabled" }); })))
      .toContain("capability_matrix");
    expect(errorsOf(teamMd("sales", (t) => { t.capability_matrix.find((c: any) => c.capability === "internal.note.write").enabled = true; t.task_roles[0].allowed_capabilities = ["external.read"]; })))
      .toContain("enabled but unused");
  });

  test("independent reviewer must be read-only", () => {
    expect(errorsOf(teamMd("engineering", (t) => { t.task_roles[1].allowed_capabilities.push("workspace.edit"); })))
      .toContain("review roles must hold review.read_only");
  });
});

describe("pilot team set and activation", () => {
  const all = () => (["sales", "product", "engineering"] as const).map((d) => loadOk(teamMd(d)));

  test("requires exactly one persistent sales and one each bounded product/engineering", () => {
    expect(validatePilotTeamSet(all().map((l) => l.team))).toEqual({ ok: true, errors: [] });
    const twoSales = [...all(), loadOk(teamMd("sales"))].map((l) => l.team);
    expect(validatePilotTeamSet(twoSales).errors.join()).toContain("exactly one sales");
    expect(validatePilotTeamSet(all().slice(1).map((l) => l.team)).ok).toBe(false);
  });

  test("no server context fails closed; placeholders never become grants", () => {
    const report = derivePilotActivationReport(all(), undefined);
    expect(report.activatable).toBe(false);
    expect(report.teams[0]!.blockers.some((b) => b.reason === "context_unavailable")).toBe(true);
    // Even a context that "resolves" the placeholder strings cannot activate them.
    const placeholders = new Set(all().flatMap((l) => l.activationBlockers.map((b) => b.ref!)));
    const sneaky = derivePilotActivationReport(all(), { resolvedRefs: placeholders, privatePreviewWindowOpen: true });
    expect(sneaky.activatable).toBe(false);
  });

  test("configured refs activate only when immutable and resolved by the server context", () => {
    const digest = "@sha256:" + "f".repeat(64);
    const configure = (dept: Dept, mutable = false) => teamMd(dept, (t) => {
      for (const k of Object.keys(t.profiles)) t.profiles[k] = `fixture://profiles/${dept}/${k}${mutable && k === "model" ? ":latest" : digest}`;
      t.captain.owner_ref = `fixture://principals/${dept}-owner`;
      t.approvals.approver_ref = `fixture://principals/${dept}-approver`;
      for (const r of t.resources) r.ref = `fixture://resources/${dept}/${r.id}`;
    });
    const teams = (["sales", "product", "engineering"] as const).map((d) => loadOk(configure(d)));
    expect(teams.every((t) => t.activationBlockers.length === 0)).toBe(true);
    const refs = new Set(teams.flatMap(({ team: t }) => [
      ...Object.values(t.profiles), t.captain.owner_ref, t.approvals.approver_ref, ...t.resources.map((r) => r.ref),
    ]));
    expect(derivePilotActivationReport(teams, { resolvedRefs: refs, privatePreviewWindowOpen: false }).activatable).toBe(true);

    const missing = new Set([...refs].filter((r) => !r.includes("/sales/source-read")));
    const r1 = derivePilotActivationReport(teams, { resolvedRefs: missing, privatePreviewWindowOpen: false });
    expect(r1.activatable).toBe(false);
    expect(r1.teams[0]!.blockers).toEqual([{ path: "resources.source-read.ref", ref: "fixture://resources/sales/source-read", reason: "unresolved" }]);

    const mutable = loadOk(configure("product", true));
    const r2 = derivePilotActivationReport([teams[0]!, mutable, teams[2]!], { resolvedRefs: new Set([...refs, mutable.team.profiles.model]), privatePreviewWindowOpen: false });
    expect(r2.teams[1]!.blockers.map((b) => b.reason)).toEqual(["mutable_profile"]);
  });

  test("enabled private.preview blocks activation until the server opens the preview window", () => {
    const t = loadOk(teamMd("product", (x) => {
      x.capability_matrix.find((c: any) => c.capability === "private.preview").enabled = true;
      x.capability_matrix.find((c: any) => c.capability === "private.preview").approval = "human_required";
      x.task_roles.push(role("brief", "draft_task", ["external.read", "private.preview"]));
    }));
    const report = derivePilotActivationReport([t], { resolvedRefs: new Set(), privatePreviewWindowOpen: false });
    expect(report.teams[0]!.blockers.some((b) => b.reason === "preview_window_closed")).toBe(true);
  });
});
