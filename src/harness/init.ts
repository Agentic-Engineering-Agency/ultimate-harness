import path from "node:path";

export type InitResult = {
  created: string[];
  existed: string[];
};

export async function initializeHarness(
  root: string,
  force = false,
): Promise<InitResult> {
  const { mkdir, writeFile, stat } = await import("node:fs/promises");
  const { parse, stringify } = await import("yaml");

  const projectPath = path.join(root, ".harness", "project.yaml");

  // Check if already initialized
  try {
    await stat(projectPath);
    if (!force) {
      return {
        created: [],
        existed: [projectPath],
      };
    }
  } catch {
    // File doesn't exist, proceed
  }

  const created: string[] = [];

  // Create directory structure
  const dirs = [
    ".harness",
    ".harness/adapters",
    ".harness/workflows",
    ".harness/skills",
    ".harness/specs/active",
    ".harness/specs/archive",
    ".harness/missions",
    ".harness/sandboxes",
    ".harness/audit",
  ];

  for (const d of dirs) {
    const fullPath = path.join(root, d);
    await mkdir(fullPath, { recursive: true });
    created.push(fullPath);
  }

  // Create project.yaml
  const projectContent = {
    schema_version: "uh.project.v0",
    id: path.basename(root),
    name: path.basename(root),
    root_path: ".",
    created_at: new Date().toISOString(),
    issue_sources: [],
    default_workflow_profiles: [
      "research-docs",
      "spec-first-feature",
      "bugfix-contained",
      "adapter-design",
      "skill-authoring",
    ],
    artifact_schema_version: "uh.project.v0",
  };

  await writeFile(
    projectPath,
    stringify(projectContent),
    "utf-8",
  );
  created.push(projectPath);

  // Create skills index
  const skillsIndexPath = path.join(root, ".harness", "skills", "index.yaml");
  await writeFile(skillsIndexPath, stringify({ schema_version: "uh.skills-index.v0", skills: [] }), "utf-8");
  created.push(skillsIndexPath);

  // Create sandboxes index
  const sandboxesIndexPath = path.join(
    root,
    ".harness",
    "sandboxes",
    "index.yaml",
  );
  await writeFile(
    sandboxesIndexPath,
    stringify({ schema_version: "uh.sandboxes-index.v0", sandboxes: [] }),
    "utf-8",
  );
  created.push(sandboxesIndexPath);

  // Create audit log
  const auditPath = path.join(root, ".harness", "audit", "events.ndjson");
  await writeFile(auditPath, "", "utf-8");
  created.push(auditPath);

  // Create default workflow profiles
  const workflows = getDefaultWorkflows();
  for (const [name, content] of Object.entries(workflows)) {
    const wfPath = path.join(root, ".harness", "workflows", `${name}.yaml`);
    await writeFile(wfPath, stringify(content), "utf-8");
    created.push(wfPath);
  }

  // Log the init event
  const auditEntry = JSON.stringify({
    event: "project.init",
    timestamp: new Date().toISOString(),
    root,
    force,
  });
  await writeFile(auditPath, `${auditEntry}\n`, "utf-8");

  return { created, existed: [] };
}

function getDefaultWorkflows(): Record<string, unknown> {
  const bmad = {
    inspiration: "BMAD-METHOD",
    dependency: false,
    roles: [
      "Analyst",
      "Product Manager",
      "Architect",
      "Scrum Master / Workflow Designer",
      "Developer",
      "QA / Test Architect",
      "Technical Writer",
    ],
    guardrails: [
      "BMAD is inspiration only, not a runtime dependency.",
      "Roles are hats; a single agent may play multiple roles.",
      "Outputs should be traceable and reviewable.",
      "Do not import BMAD-METHOD as a dependency.",
    ],
  };

  return {
    "research-docs": {
      schema_version: "uh.workflow.v0",
      id: "research-docs",
      name: "Research & Documentation",
      description: "Research a topic and produce documented findings.",
      bmad,
      phases: [
        { name: "research", agent_role: "researcher", bmad_role: "Analyst", description: "Research and gather information", outputs: ["source notes", "pattern comparison", "risk list"] },
        { name: "draft", agent_role: "writer", bmad_role: "Technical Writer", description: "Draft documentation", outputs: ["draft documentation"] },
        { name: "review", agent_role: "reviewer", bmad_role: "QA / Test Architect", description: "Review for accuracy and completeness", outputs: ["review notes", "verification status"] },
      ],
    },
    "spec-first-feature": {
      schema_version: "uh.workflow.v0",
      id: "spec-first-feature",
      name: "Spec-First Feature Development",
      description: "Define spec before implementation.",
      bmad,
      phases: [
        { name: "spec", agent_role: "architect", bmad_role: "Architect", description: "Write technical specification", outputs: ["technical specification", "adapter and schema notes"] },
        { name: "implement", agent_role: "developer", bmad_role: "Developer", description: "Implement according to spec", outputs: ["code changes", "implementation notes"] },
        { name: "verify", agent_role: "reviewer", bmad_role: "QA / Test Architect", description: "Verify implementation against spec", outputs: ["test results", "review gate decision"] },
      ],
    },
    "bugfix-contained": {
      schema_version: "uh.workflow.v0",
      id: "bugfix-contained",
      name: "Contained Bug Fix",
      description: "Investigate, fix, and verify a bug.",
      bmad,
      phases: [
        { name: "reproduce", agent_role: "researcher", bmad_role: "Analyst", description: "Reproduce and understand the bug", outputs: ["reproduction steps", "impact notes"] },
        { name: "fix", agent_role: "developer", bmad_role: "Developer", description: "Implement the fix", outputs: ["code changes", "fix notes"] },
        { name: "verify", agent_role: "reviewer", bmad_role: "QA / Test Architect", description: "Verify fix and regression testing", outputs: ["regression test results", "review gate decision"] },
      ],
    },
    "adapter-design": {
      schema_version: "uh.workflow.v0",
      id: "adapter-design",
      name: "Runtime Adapter Design",
      description: "Design and implement a runtime adapter.",
      bmad,
      phases: [
        { name: "research", agent_role: "researcher", bmad_role: "Analyst", description: "Study runtime capabilities", outputs: ["runtime capability notes", "risk list"] },
        { name: "design", agent_role: "architect", bmad_role: "Architect", description: "Design adapter contract", outputs: ["adapter contract", "schema and sandboxing notes"] },
        { name: "implement", agent_role: "developer", bmad_role: "Developer", description: "Implement adapter", outputs: ["adapter implementation", "usage notes"] },
        { name: "test", agent_role: "reviewer", bmad_role: "QA / Test Architect", description: "Test with sample missions", outputs: ["sample mission test results", "review gate decision"] },
      ],
    },
    "skill-authoring": {
      schema_version: "uh.workflow.v0",
      id: "skill-authoring",
      name: "Skill Authoring",
      description: "Create or update a skill with SKILL.md and supporting files.",
      bmad,
      phases: [
        { name: "draft", agent_role: "writer", bmad_role: "Technical Writer", description: "Draft SKILL.md content", outputs: ["draft SKILL.md"] },
        { name: "structure", agent_role: "architect", bmad_role: "Architect", description: "Create references/templates/scripts", outputs: ["supporting files", "structure notes"] },
        { name: "review", agent_role: "reviewer", bmad_role: "QA / Test Architect", description: "Review for clarity and completeness", outputs: ["review notes", "verification status"] },
      ],
    },
  };
}
